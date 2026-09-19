/**
 * §9 — a staff member reading a client's progress photos.
 *
 * This is the most sensitive read in the app: pictures of somebody's body,
 * shown to someone who is not them. Three gates gate it, and every one of them
 * gets a test that fails loudly rather than a comment that hopes.
 *
 * 1. An ACTIVE `StaffLink`, in a capacity the caller actually holds.
 * 2. The PHOTOS consent, capped by the role's ceiling.
 * 3. `effectivePhotoAudience` **per photo** — the gate that makes a per-photo
 *    override worth having.
 *
 * The fourth assertion has no gate of its own and matters as much: when the
 * consent is absent the photo table is **not queried at all**. A filter applied
 * after a read is one refactor away from being dropped; a read that never
 * happens cannot leak.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const linkFindFirst = vi.fn();
const consentFindMany = vi.fn();
const photoFindMany = vi.fn();
const auditCreate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    staffLink: { findFirst: (...a: unknown[]) => linkFindFirst(...a) },
    consent: { findMany: (...a: unknown[]) => consentFindMany(...a) },
    photo: { findMany: (...a: unknown[]) => photoFindMany(...a) },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));

// A signed URL needs no network here; the point is which rows reach it.
vi.mock("../lib/storage", () => ({
  createSignedReadUrl: async (path: string) => `https://signed.test/${path}`,
  createSignedUploadUrl: async () => ({ signedUrl: "", token: "" }),
  deleteObject: async () => undefined,
  extensionFor: () => "jpg",
  storageConfigured: () => true,
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const TRAINER = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";

const pt = () => appRouter.createCaller(ctx({ id: TRAINER, role: "USER", staff: ["PT"] })).photos;
const prac = () =>
  appRouter.createCaller(ctx({ id: TRAINER, role: "USER", staff: ["PRACTITIONER"] })).photos;

const photo = (id: string, override: string | null = null) => ({
  id,
  storagePath: `${CLIENT}/${id}.jpg`,
  takenOn: new Date("2026-09-10T00:00:00.000Z"),
  audienceOverride: override,
  mimeType: "image/jpeg",
  createdAt: new Date("2026-09-10T09:00:00.000Z"),
});

beforeEach(() => {
  vi.clearAllMocks();
  linkFindFirst.mockResolvedValue({
    kind: "PT",
    client: { fullName: "Ann Client", email: "ann@example.test" },
  });
  consentFindMany.mockResolvedValue([{ category: "PHOTOS", audience: "TRAINER" }]);
  photoFindMany.mockResolvedValue([photo("p1")]);
  auditCreate.mockResolvedValue({});
});

/* ------------------------------------------------------------------ */

describe("gate 1 — the link", () => {
  it("refuses an unauthenticated caller and a plain member", async () => {
    await expect(
      appRouter.createCaller(ctx(null)).photos.clientList({ clientId: CLIENT }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      appRouter.createCaller(ctx({ id: "u1", role: "USER" })).photos.clientList({ clientId: CLIENT }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  /**
   * NOT_FOUND, never FORBIDDEN. FORBIDDEN would confirm the account exists and
   * turn this endpoint into a way to probe for users by uuid.
   */
  it("is NOT_FOUND — not FORBIDDEN — without an active link", async () => {
    linkFindFirst.mockResolvedValue(null);
    await expect(pt().clientList({ clientId: CLIENT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(photoFindMany).not.toHaveBeenCalled();
  });

  it("requires the link to be ACTIVE and in a capacity the caller holds", async () => {
    await pt().clientList({ clientId: CLIENT });
    const where = (linkFindFirst.mock.calls[0]?.[0] as Record<string, unknown>)
      .where as Record<string, unknown>;
    expect(where.staffId).toBe(TRAINER);
    expect(where.status).toBe("ACTIVE");
    expect(JSON.stringify(where.AND)).toContain("PT");
  });

  // ADMIN is deliberately not staff: running the platform is not being
  // somebody's care provider.
  it("refuses an admin", async () => {
    await expect(
      appRouter.createCaller(ctx({ id: "a1", role: "ADMIN" })).photos.clientList({ clientId: CLIENT }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

/* ------------------------------------------------------------------ */

describe("gate 2 — the consent", () => {
  /**
   * The distinction the return shape exists for. "They have not shared their
   * photos" and "they have not taken any" are different sentences, and a screen
   * handed an empty array would pick the wrong one.
   */
  it("says not-shared rather than returning an empty gallery", async () => {
    consentFindMany.mockResolvedValue([{ category: "ACTIVITY", audience: "TRAINER" }]);
    const res = await pt().clientList({ clientId: CLIENT });
    expect(res.shared).toBe(false);
    expect(res.photos).toEqual([]);
  });

  /**
   * Not filtered after reading — not read. A filter applied to a result set is
   * one refactor from being dropped; a query that never runs cannot leak.
   */
  it("does not query the photo table at all without consent", async () => {
    consentFindMany.mockResolvedValue([]);
    await pt().clientList({ clientId: CLIENT });
    expect(photoFindMany).not.toHaveBeenCalled();
  });

  it("refuses a consent aimed at a different audience", async () => {
    // Shared with a practitioner; the caller is a trainer.
    consentFindMany.mockResolvedValue([{ category: "PHOTOS", audience: "PRACTITIONER" }]);
    const res = await pt().clientList({ clientId: CLIENT });
    expect(res.shared).toBe(false);
  });

  /**
   * The capacity comes from the LINK, not from everything the caller holds
   * elsewhere. A practitioner link reads as a practitioner; a PT link does not
   * inherit the wider ceiling because the same person is a practitioner for
   * somebody else.
   */
  it("reads through the capacity the link was formed in", async () => {
    linkFindFirst.mockResolvedValue({
      kind: "PT",
      client: { fullName: null, email: "ann@example.test" },
    });
    consentFindMany.mockResolvedValue([{ category: "PHOTOS", audience: "PRACTITIONER" }]);
    // Caller holds PRACTITIONER, but this link is a PT link.
    const res = await prac().clientList({ clientId: CLIENT });
    expect(res.shared).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("gate 3 — the per-photo override", () => {
  it("returns photos with no override when the category is shared", async () => {
    const res = await pt().clientList({ clientId: CLIENT });
    expect(res.shared).toBe(true);
    expect(res.photos).toHaveLength(1);
    expect(res.photos[0]?.url).toContain("signed.test");
  });

  /**
   * The reason per-photo overrides exist. The client shared the category with
   * their trainer and then hid this one photo; it stays hidden.
   */
  it("hides a photo the client marked private, inside a shared category", async () => {
    photoFindMany.mockResolvedValue([photo("p1"), photo("p2", "NONE")]);
    const res = await pt().clientList({ clientId: CLIENT });
    expect(res.photos.map((p) => p.id)).toEqual(["p1"]);
  });

  /**
   * An override naming a different audience resolves to nobody, rather than
   * falling back to the category. "Only my practitioner" must never show a
   * trainer the photo.
   */
  it("hides a photo overridden to another audience", async () => {
    photoFindMany.mockResolvedValue([photo("p1", "PRACTITIONER")]);
    const res = await pt().clientList({ clientId: CLIENT });
    expect(res.photos).toEqual([]);
    // Still audited — the gallery was opened, even though it showed nothing.
    expect(auditCreate).toHaveBeenCalled();
  });

  it("shows a photo explicitly overridden TO this reader", async () => {
    photoFindMany.mockResolvedValue([photo("p1", "TRAINER")]);
    const res = await pt().clientList({ clientId: CLIENT });
    expect(res.photos.map((p) => p.id)).toEqual(["p1"]);
  });

  /**
   * The override filter runs after the query, so the query over-fetches. The
   * caller's limit must still be the limit they get.
   */
  it("never returns more than the requested limit", async () => {
    photoFindMany.mockResolvedValue(Array.from({ length: 40 }, (_, i) => photo(`p${i}`)));
    const res = await pt().clientList({ clientId: CLIENT, limit: 5 });
    expect(res.photos).toHaveLength(5);
  });
});

/* ------------------------------------------------------------------ */

describe("what comes back, and what is recorded", () => {
  /**
   * Who else the client shares a photo with is their business. A trainer
   * learning that a photo is also visible to a practitioner learns something
   * about the client's care that nobody chose to tell them.
   */
  it("never discloses the photo's audience settings", async () => {
    photoFindMany.mockResolvedValue([photo("p1", "TRAINER")]);
    const res = await pt().clientList({ clientId: CLIENT });
    expect(JSON.stringify(res)).not.toContain("audienceOverride");
    expect(res.photos[0]).not.toHaveProperty("audienceOverride");
  });

  // Storage paths begin with the owner's user id and are never client-facing.
  it("hands back signed URLs, not storage paths", async () => {
    const res = await pt().clientList({ clientId: CLIENT });
    expect(res.photos[0]).not.toHaveProperty("storagePath");
  });

  /**
   * Its own action, not folded into `staff.viewed_client`. "Who looked at
   * pictures of this person" is a question an access review must be able to ask
   * without decoding another action's metadata.
   */
  it("records the read under its own action, with no health data in the meta", async () => {
    await pt().clientList({ clientId: CLIENT });
    const data = (auditCreate.mock.calls[0]?.[0] as Record<string, unknown>)
      .data as Record<string, unknown>;
    expect(data.action).toBe("staff.viewed_photos");
    expect(data.actorId).toBe(TRAINER);
    expect(data.subjectId).toBe(CLIENT);
    expect(data.meta).toEqual({ role: "PT", shown: 1 });
  });
});
