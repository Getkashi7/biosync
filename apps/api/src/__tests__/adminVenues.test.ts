/**
 * Venues — the only place a check-in secret is ever written.
 *
 * The property worth pinning is an absence: there is no read path for
 * `checkInSecret` anywhere in the app. An admin creates a venue and never sees
 * its key; a display asks `gym.checkInToken` for a signed token instead. That
 * is what makes "the secret never leaves the server" a fact about the code
 * rather than a promise in a comment, and it only stays true if something
 * fails when a select grows.
 *
 * The other one: editing a venue must not rotate its secret. Renaming a gym
 * and invalidating the code on its wall would be a silent outage that nobody
 * would connect to the rename.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const venueFindMany = vi.fn();
const venueCreate = vi.fn();
const venueUpdate = vi.fn();
const venueUpdateMany = vi.fn();
const auditCreate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    venue: {
      findMany: (...a: unknown[]) => venueFindMany(...a),
      create: (...a: unknown[]) => venueCreate(...a),
      update: (...a: unknown[]) => venueUpdate(...a),
      updateMany: (...a: unknown[]) => venueUpdateMany(...a),
    },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const VENUE = "0f1e5a5c-2b5e-4a3f-9c2a-7b1d9e8f0a11";

const admin = () => appRouter.createCaller(ctx({ id: ADMIN_ID, role: "ADMIN" })).admin;
const args = (a: unknown) => (a ?? {}) as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  venueFindMany.mockResolvedValue([]);
  venueCreate.mockResolvedValue({ id: VENUE });
  venueUpdate.mockResolvedValue({ id: VENUE });
  venueUpdateMany.mockResolvedValue({ count: 1 });
  auditCreate.mockResolvedValue({});
});

describe("who may manage venues", () => {
  /**
   * A venue is platform infrastructure. A coach schedules classes at a site;
   * they do not decide the site exists, and they certainly do not rotate its
   * key.
   */
  it("refuses a member and a verified coach alike", async () => {
    for (const user of [
      { id: "u1", role: "USER" as const },
      { id: "p1", role: "USER" as const, staff: ["PT" as const] },
    ]) {
      const caller = appRouter.createCaller(ctx(user)).admin;
      await expect(caller.venues()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.saveVenue({ name: "Arch 12", timezone: "Europe/London", active: true }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.rotateVenueSecret({ id: VENUE })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });
});

describe("the secret has no read path", () => {
  it("the admin listing does not select it", async () => {
    await admin().venues();
    const select = args(args(venueFindMany.mock.calls[0]?.[0]).select);
    expect(select.checkInSecret).toBeUndefined();
  });

  it("creating a venue returns an id and nothing else", async () => {
    const res = await admin().saveVenue({
      name: "Arch 12",
      timezone: "Europe/London",
      active: true,
    });
    expect(Object.keys(res)).toEqual(["id"]);
    expect(args(args(venueCreate.mock.calls[0]?.[0]).select).checkInSecret).toBeUndefined();
  });

  it("rotating returns an acknowledgement, not the new key", async () => {
    const res = await admin().rotateVenueSecret({ id: VENUE });
    expect(res).toEqual({ ok: true });
    expect(JSON.stringify(res)).not.toContain("=");
  });
});

describe("saving a venue", () => {
  it("generates a secret on create, and a different one each time", async () => {
    await admin().saveVenue({ name: "Arch 12", timezone: "Europe/London", active: true });
    await admin().saveVenue({ name: "Arch 13", timezone: "Europe/London", active: true });
    const first = args(args(venueCreate.mock.calls[0]?.[0]).data).checkInSecret as string;
    const second = args(args(venueCreate.mock.calls[1]?.[0]).data).checkInSecret as string;
    expect(first).toEqual(expect.any(String));
    expect(first.length).toBeGreaterThan(30);
    expect(second).not.toBe(first);
  });

  /**
   * A rename must not take down the code on the wall. Rotation is its own act,
   * and it is the only thing that invalidates a display.
   */
  it("leaves the secret alone when editing", async () => {
    await admin().saveVenue({
      id: VENUE,
      name: "Arch 12 (renamed)",
      timezone: "Europe/London",
      active: true,
    });
    expect(venueCreate).not.toHaveBeenCalled();
    const data = args(args(venueUpdate.mock.calls[0]?.[0]).data);
    expect(data.checkInSecret).toBeUndefined();
    expect(data.name).toBe("Arch 12 (renamed)");
  });

  /**
   * Said plainly rather than absorbed. `zoneOffsetMinutes` falls back to UTC
   * for an unknown zone so a bad row cannot take the schedule screen down —
   * which is the right behaviour at read time and exactly the wrong one here,
   * where someone is about to save the bad row.
   */
  it("refuses a time zone this server cannot resolve", async () => {
    await expect(
      admin().saveVenue({ name: "Arch 12", timezone: "Mars/Olympus_Mons", active: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(venueCreate).not.toHaveBeenCalled();
  });

  it("records the act, and whether it was a creation", async () => {
    await admin().saveVenue({ name: "Arch 12", timezone: "Europe/London", active: true });
    const data = args(args(auditCreate.mock.calls[0]?.[0]).data);
    expect(data.action).toBe("venue.saved");
    expect(data.meta).toEqual({ created: true, active: true });
  });

  // Deactivating is the only safe retirement: Venue is Restrict from classes
  // and visits, so deleting one would take last year's attendance with it.
  it("deactivates rather than deleting", async () => {
    await admin().saveVenue({ id: VENUE, name: "Arch 12", timezone: "Europe/London", active: false });
    expect(args(args(venueUpdate.mock.calls[0]?.[0]).data).active).toBe(false);
  });

  it("is NOT_FOUND when rotating a venue that does not exist", async () => {
    venueUpdateMany.mockResolvedValue({ count: 0 });
    await expect(admin().rotateVenueSecret({ id: VENUE })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
