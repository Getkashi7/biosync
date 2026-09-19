/**
 * What the data export actually hands over.
 *
 * `account.test.ts` covers who may call this. This covers what comes back —
 * which matters because an export is the one response in the app that a person
 * may still be reading in five years, long after every screen that produced it
 * has changed.
 *
 * Two properties, and they pull in opposite directions. It must be **complete**,
 * because the point of the right is that nothing is held back. And it must not
 * carry things that are not the person's data to take: a credential digest, a
 * storage path, somebody else's actions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const findUnique = vi.fn();
const planFindMany = vi.fn();
const photoFindMany = vi.fn();
const inviteFindMany = vi.fn();

vi.mock("../db", () => {
  // Most tables are read the same way and their contents do not matter here;
  // the four that do get their own mock so a test can inspect the call.
  const empty = {
    findMany: (...a: unknown[]) => findMany(...a),
    findUnique: (...a: unknown[]) => findUnique(...a),
  };
  return {
    prisma: {
      user: empty,
      dailyLog: empty,
      metric: empty,
      readinessSnapshot: empty,
      meal: empty,
      supplement: empty,
      supplementLog: empty,
      goal: empty,
      consent: empty,
      photo: { findMany: (...a: unknown[]) => photoFindMany(...a) },
      notificationPrefs: empty,
      notificationNudge: empty,
      staffProfile: empty,
      staffLink: empty,
      clientInvite: { findMany: (...a: unknown[]) => inviteFindMany(...a) },
      trainingPlan: { findMany: (...a: unknown[]) => planFindMany(...a) },
      sessionNote: empty,
    },
  };
});

vi.mock("../lib/storage", () => ({
  createSignedReadUrl: async (path: string) => `https://signed.test/${path}`,
  deleteAllUserObjects: async () => undefined,
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const ME = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const me = () => appRouter.createCaller(ctx({ id: ME, role: "USER" })).account;

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  findUnique.mockResolvedValue({
    id: ME,
    email: "me@example.test",
    fullName: "Me",
    role: "USER",
    createdAt: new Date(),
  });
  planFindMany.mockResolvedValue([]);
  photoFindMany.mockResolvedValue([]);
  inviteFindMany.mockResolvedValue([]);
});

describe("the envelope", () => {
  /**
   * A versioned format string, so a file opened years later can be identified
   * rather than guessed at.
   */
  it("names its own format and when it was made", async () => {
    const res = await me().exportData();
    expect(res.format).toBe("biosync.export.v1");
    expect(() => new Date(res.exportedAt).toISOString()).not.toThrow();
  });

  /**
   * The notes are part of the deliverable. "Photo links expire" is something
   * the reader has to know before they archive this and come back to broken
   * images.
   */
  it("says out loud that photo links expire", async () => {
    const res = await me().exportData();
    expect(res.notes.join(" ").toLowerCase()).toContain("expire");
  });

  /**
   * Audit rows are deliberately absent, and the export says so rather than
   * quietly omitting them. They record other people's actions on this person's
   * data, so exporting them would hand over someone else's record.
   */
  it("explains the one omission instead of hiding it", async () => {
    const res = await me().exportData();
    expect(res.notes.join(" ").toLowerCase()).toContain("audit");
    expect(res).not.toHaveProperty("auditLog");
  });
});

describe("training plans", () => {
  const plan = (items: unknown) => ({
    id: "pl1",
    trainerId: "t1",
    clientId: ME,
    week: "2026-W38",
    title: "Base week",
    items,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("exports well-formed plan items as themselves", async () => {
    planFindMany.mockResolvedValue([
      plan([{ name: "Squat", sets: 3, reps: 5 }]),
    ]);
    const res = await me().exportData();
    expect(res.coaching.trainingPlans[0]?.items).toEqual([{ name: "Squat", sets: 3, reps: 5 }]);
  });

  /**
   * `items` is a Json column, so a row written by an older version can hold a
   * shape this one does not recognise. Parsing it through the same reader the
   * rest of the app uses means the export never contains something the reader
   * cannot interpret — and it is what keeps Prisma's recursive `JsonValue` out
   * of the client's derived types (TS2589).
   */
  it("does not emit a plan shape nothing can read", async () => {
    planFindMany.mockResolvedValue([plan({ legacy: "some other shape" })]);
    const res = await me().exportData();
    expect(res.coaching.trainingPlans[0]?.items).toEqual([]);
  });
});

describe("what it must not carry", () => {
  /**
   * A storage path is an internal addressing detail, and the export hands over
   * a link that works instead.
   *
   * Note what is NOT asserted: that the path string is absent from the
   * response. A Supabase signed URL contains the object path by construction —
   * that is what it signs — so demanding its absence would be demanding a
   * broken link. The field is what must not be there.
   */
  it("gives photos a download link rather than a storage path field", async () => {
    photoFindMany.mockResolvedValue([
      {
        id: "ph1",
        storagePath: `${ME}/secret-path.jpg`,
        takenOn: new Date("2026-09-10T00:00:00.000Z"),
        audienceOverride: null,
        mimeType: "image/jpeg",
        byteSize: 1234,
        createdAt: new Date(),
      },
    ]);
    const res = await me().exportData();
    expect(res.photos[0]?.downloadUrl).toContain("signed.test");
    expect(res.photos[0]).not.toHaveProperty("storagePath");
    // Every photo carries a usable link or the export is not portable.
    expect(res.photos.every((ph) => typeof ph.downloadUrl === "string")).toBe(true);
  });

  /**
   * An invite code digest is a credential, not a record of anything the person
   * did. Exporting it serves no portability purpose and hands over something
   * that gates access.
   */
  it("never exports an invite code digest", async () => {
    await me().exportData();
    const args = inviteFindMany.mock.calls[0]?.[0] as { select?: unknown } | undefined;
    expect(JSON.stringify(args?.select ?? {})).not.toContain("codeHash");
  });
});
