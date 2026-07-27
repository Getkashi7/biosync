/**
 * Platform administration.
 *
 * Two things are being protected here. First, that only an admin can reach any
 * of it — granting a practitioner capability hands someone the ability to read
 * another person's biometrics and diagnostics. Second, that the lookup can't be
 * turned into a way to enumerate the membership: it matches a full address, not
 * a fragment, so an admin can act on someone they already know of rather than
 * browsing everyone who uses the app.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  user: { findUnique: vi.fn(), count: vi.fn() },
  staffProfile: { findMany: vi.fn(), count: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  staffLink: { count: vi.fn() },
  clientInvite: { count: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("../db", () => ({ prisma: db }));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const ADMIN = ctx({ id: "a1", role: "ADMIN" });
const USER = ctx({ id: "u1", role: "USER" });
const STAFF = ctx({ id: "s1", role: "USER", staff: ["PT"] });
const TARGET = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  for (const model of Object.values(db)) for (const fn of Object.values(model)) fn.mockReset();
  db.user.count.mockResolvedValue(0);
  db.staffProfile.count.mockResolvedValue(0);
  db.staffLink.count.mockResolvedValue(0);
  db.clientInvite.count.mockResolvedValue(0);
});

describe("admin authorization", () => {
  it("refuses an anonymous caller", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.admin.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.admin.findUser({ email: "a@b.com" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses a regular user", async () => {
    const caller = appRouter.createCaller(USER);
    await expect(caller.admin.findUser({ email: "a@b.com" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.admin.grantStaff({ userId: TARGET, kind: "PT" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a verified staff member — being a trainer is not running the platform", async () => {
    const caller = appRouter.createCaller(STAFF);
    await expect(caller.admin.findUser({ email: "a@b.com" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.admin.grantStaff({ userId: TARGET, kind: "PRACTITIONER" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.staffProfile.upsert).not.toHaveBeenCalled();
  });
});

describe("admin.findUser", () => {
  it("matches the whole address, never a fragment", async () => {
    db.user.findUnique.mockResolvedValue({ id: TARGET, email: "a@b.com", staffProfiles: [] });
    const caller = appRouter.createCaller(ADMIN);
    await caller.admin.findUser({ email: "a@b.com" });

    const where = db.user.findUnique.mock.calls[0]?.[0]?.where;
    // A `contains`/`startsWith` here would let one query return the membership.
    expect(where).toEqual({ email: "a@b.com" });
    expect(JSON.stringify(where)).not.toMatch(/contains|startsWith|endsWith|search|mode/);
  });

  it("lower-cases the address so a capitalised one still finds the account", async () => {
    db.user.findUnique.mockResolvedValue({ id: TARGET, email: "a@b.com", staffProfiles: [] });
    const caller = appRouter.createCaller(ADMIN);
    await caller.admin.findUser({ email: "A@B.CoM" });
    expect(db.user.findUnique.mock.calls[0]?.[0]?.where?.email).toBe("a@b.com");
  });

  it("rejects anything that isn't an email, before querying", async () => {
    const caller = appRouter.createCaller(ADMIN);
    await expect(caller.admin.findUser({ email: "a" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // The wildcard someone would try if they were fishing.
    await expect(caller.admin.findUser({ email: "%" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("is NOT_FOUND for an unknown address", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const caller = appRouter.createCaller(ADMIN);
    await expect(caller.admin.findUser({ email: "nobody@b.com" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns capabilities in every status, since that decides the next action", async () => {
    // A suspended capability is re-granted, not granted; the UI needs to know.
    db.user.findUnique.mockResolvedValue({
      id: TARGET,
      email: "a@b.com",
      fullName: "A B",
      role: "USER",
      staffProfiles: [
        { kind: "PT", status: "VERIFIED" },
        { kind: "PRACTITIONER", status: "SUSPENDED" },
      ],
    });
    const caller = appRouter.createCaller(ADMIN);
    const res = await caller.admin.findUser({ email: "a@b.com" });
    expect(res.user.staffProfiles).toHaveLength(2);
    expect(res.user.staffProfiles.map((p) => p.status)).toEqual(["VERIFIED", "SUSPENDED"]);
  });

  it("selects no health data", async () => {
    db.user.findUnique.mockResolvedValue({ id: TARGET, email: "a@b.com", staffProfiles: [] });
    const caller = appRouter.createCaller(ADMIN);
    await caller.admin.findUser({ email: "a@b.com" });

    // Admins run the platform; they are not on anyone's care team.
    const select = JSON.stringify(db.user.findUnique.mock.calls[0]?.[0]?.select);
    for (const leak of ["dailyLogs", "metrics", "meals", "readiness", "consents", "supplements"]) {
      expect(select).not.toContain(leak);
    }
  });
});

describe("admin.stats", () => {
  it("reports counts, not records", async () => {
    db.user.count.mockResolvedValue(42);
    db.staffProfile.count.mockResolvedValue(3);
    db.staffLink.count.mockResolvedValue(7);
    db.clientInvite.count.mockResolvedValue(2);

    const caller = appRouter.createCaller(ADMIN);
    const res = await caller.admin.stats();

    expect(res.users).toBe(42);
    expect(res.activeLinks).toBe(7);
    expect(res.openInvites).toBe(2);
    expect(res.staff).toEqual({ verified: 3, pending: 3, suspended: 3 });
  });

  it("counts only invitations that can still be redeemed", async () => {
    const caller = appRouter.createCaller(ADMIN);
    await caller.admin.stats();
    expect(db.clientInvite.count.mock.calls[0]?.[0]?.where).toEqual({
      acceptedAt: null,
      revokedAt: null,
    });
  });

  it("counts only ACTIVE links, so revoked ones don't inflate the figure", async () => {
    const caller = appRouter.createCaller(ADMIN);
    await caller.admin.stats();
    expect(db.staffLink.count.mock.calls[0]?.[0]?.where).toEqual({ status: "ACTIVE" });
  });
});
