/**
 * The access record (9F), from both sides.
 *
 * What must hold: a staff member sees only their own reads, and only of a
 * client they are actively linked to; a client sees every provider's reads of
 * *themselves* and nobody else's; and nothing appears on the record that the
 * audit trail did not actually log.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const linkFindFirst = vi.fn();
const auditFindMany = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    staffLink: { findFirst: (...a: unknown[]) => linkFindFirst(...a) },
    auditLog: { findMany: (...a: unknown[]) => auditFindMany(...a) },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findMany: (...a: unknown[]) => userFindMany(...a),
    },
  },
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const PRAC = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";

const prac = () =>
  appRouter.createCaller(ctx({ id: PRAC, role: "USER", staff: ["PRACTITIONER"] })).staff;
const client = () => appRouter.createCaller(ctx({ id: CLIENT, role: "USER" })).account;

const row = (action: string, iso: string, actorId = PRAC) => ({
  actorId,
  action,
  createdAt: new Date(iso),
});

beforeEach(() => {
  vi.clearAllMocks();
  linkFindFirst.mockResolvedValue({ kind: "PRACTITIONER" });
  auditFindMany.mockResolvedValue([]);
  userFindUnique.mockResolvedValue({ fullName: "Sarah Chen", email: "sarah@example.test" });
  userFindMany.mockResolvedValue([]);
});

describe("staff.accessRecord", () => {
  it("refuses an unlinked client as NOT_FOUND, and reads nothing", async () => {
    linkFindFirst.mockResolvedValue(null);
    await expect(prac().accessRecord({ clientId: CLIENT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(auditFindMany).not.toHaveBeenCalled();
  });

  it("asks only for the caller's own reads of this client", async () => {
    await prac().accessRecord({ clientId: CLIENT });
    const where = (auditFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where.actorId).toBe(PRAC);
    expect(where.subjectId).toBe(CLIENT);
    expect(where.action).toEqual({ in: ["staff.viewed_client", "staff.viewed_photos"] });
  });

  it("names each logged read, newest first as queried", async () => {
    auditFindMany.mockResolvedValue([
      row("staff.viewed_photos", "2026-09-09T14:20:00.000Z"),
      row("staff.viewed_client", "2026-09-09T14:19:00.000Z"),
    ]);
    const res = await prac().accessRecord({ clientId: CLIENT });
    expect(res.clientName).toBe("Sarah Chen");
    expect(res.events.map((e) => e.what)).toEqual(["Progress photos", "Profile"]);
    expect(res.events[0]?.at).toBe("2026-09-09T14:20:00.000Z");
  });
});

describe("account.accessRecord", () => {
  /** The session decides whose record this is — there is no input to forge. */
  it("reads only rows about the caller", async () => {
    await client().accessRecord();
    const where = (auditFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where.subjectId).toBe(CLIENT);
    expect(where).not.toHaveProperty("actorId");
  });

  it("says who looked, and what at", async () => {
    auditFindMany.mockResolvedValue([row("staff.viewed_client", "2026-09-08T09:04:00.000Z")]);
    userFindMany.mockResolvedValue([{ id: PRAC, fullName: "Dr Amara Osei", email: "a@x.test" }]);
    const res = await client().accessRecord();
    expect(res.events).toEqual([
      { who: "Dr Amara Osei", what: "Profile", at: "2026-09-08T09:04:00.000Z" },
    ]);
  });

  /** Deleting an account does not un-happen the look. */
  it("keeps a read by an account that no longer exists", async () => {
    auditFindMany.mockResolvedValue([row("staff.viewed_photos", "2026-09-02T16:41:00.000Z", "gone")]);
    const res = await client().accessRecord();
    expect(res.events[0]?.who).toBe("A former care provider");
  });
});
