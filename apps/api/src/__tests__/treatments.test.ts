/**
 * §7 treatments — authorization at the tRPC boundary.
 *
 * Two halves. The first stops before any DB call and needs no database: who is
 * refused outright, and what Zod rejects. The second mocks Prisma to assert the
 * *shape of the query*, following `staffLink.test.ts` — the point being that a
 * PT must never reach the review queue and an approval must never be written by
 * someone whose link has been revoked, neither of which is visible in a result.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const staffLinkFindFirst = vi.fn();
const staffLinkFindMany = vi.fn();
const treatmentFindMany = vi.fn();
const treatmentFindUnique = vi.fn();
const treatmentFindFirst = vi.fn();
const treatmentUpdate = vi.fn();
const auditCreate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    staffLink: {
      findFirst: (...a: unknown[]) => staffLinkFindFirst(...a),
      findMany: (...a: unknown[]) => staffLinkFindMany(...a),
    },
    treatmentRequest: {
      findMany: (...a: unknown[]) => treatmentFindMany(...a),
      findUnique: (...a: unknown[]) => treatmentFindUnique(...a),
      findFirst: (...a: unknown[]) => treatmentFindFirst(...a),
      update: (...a: unknown[]) => treatmentUpdate(...a),
    },
    dailyLog: { findMany: async () => [] },
    readinessSnapshot: { findMany: async () => [] },
    metric: { findMany: async () => [] },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ treatmentRequest: { update: treatmentUpdate }, auditLog: { create: auditCreate } }),
  },
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const CLIENT = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const REQ = "0f1e5a5c-2b5e-4a3f-9c2a-7b1d9e8f0a11";
const DECLINE_REASON = "Not clinically appropriate at this time.";

beforeEach(() => {
  vi.clearAllMocks();
  staffLinkFindFirst.mockResolvedValue(null);
  staffLinkFindMany.mockResolvedValue([]);
  treatmentFindMany.mockResolvedValue([]);
  treatmentFindUnique.mockResolvedValue(null);
  treatmentFindFirst.mockResolvedValue(null);
  treatmentUpdate.mockResolvedValue({});
  auditCreate.mockResolvedValue({});
});

describe("who may touch treatments at all", () => {
  it("no token → UNAUTHORIZED, on every procedure", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.treatments.suggestions()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.treatments.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.treatments.request({ slug: "energy-review" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.treatments.withdraw({ id: REQ })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.treatments.reviewQueue()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.treatments.decide({ id: REQ, decision: "APPROVE" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a plain user is FORBIDDEN from the practitioner surface", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(caller.treatments.reviewQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.treatments.decide({ id: REQ, decision: "APPROVE" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an ADMIN is not a clinician either", async () => {
    const caller = appRouter.createCaller(ctx({ id: "a1", role: "ADMIN" }));
    await expect(caller.treatments.reviewQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  /**
   * The line this whole module exists to hold. A PT holds a real, verified
   * staff capability — `staffProcedure` lets them through — and they must still
   * be refused here. No consent from the client can change it.
   */
  it("a verified PT is FORBIDDEN from reviewing, despite holding staff capability", async () => {
    const pt = appRouter.createCaller(ctx({ id: "t1", role: "USER", staff: ["PT"] }));
    await expect(pt.treatments.reviewQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      pt.treatments.decide({ id: REQ, decision: "DECLINE", reason: DECLINE_REASON }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // and it never reached the database to find out
    expect(staffLinkFindMany).not.toHaveBeenCalled();
    expect(treatmentFindUnique).not.toHaveBeenCalled();
  });

  it("a practitioner gets past the capability gate", async () => {
    const p = appRouter.createCaller(ctx({ id: "p1", role: "USER", staff: ["PRACTITIONER"] }));
    await expect(p.treatments.reviewQueue()).resolves.toEqual({ requests: [] });
  });

  it("someone holding both capacities is admitted on the practitioner one", async () => {
    const both = appRouter.createCaller(ctx({ id: "p2", role: "USER", staff: ["PT", "PRACTITIONER"] }));
    await expect(both.treatments.reviewQueue()).resolves.toEqual({ requests: [] });
  });
});

describe("input validation", () => {
  const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));

  it("refuses a protocol that is not in the catalogue", async () => {
    await expect(caller.treatments.request({ slug: "gold-iv-drip" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses a non-uuid id", async () => {
    await expect(caller.treatments.withdraw({ id: "nope" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses a decline with no reason, before any authorization runs", async () => {
    const p = appRouter.createCaller(ctx({ id: "p1", role: "USER", staff: ["PRACTITIONER"] }));
    // @ts-expect-error deliberately omitting the required reason
    await expect(p.treatments.decide({ id: REQ, decision: "DECLINE" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(treatmentUpdate).not.toHaveBeenCalled();
  });
});

describe("the review queue only reaches this practitioner's own clients", () => {
  it("matches on an ACTIVE PRACTITIONER link and nothing else", async () => {
    const p = appRouter.createCaller(ctx({ id: "p1", role: "USER", staff: ["PRACTITIONER"] }));
    await p.treatments.reviewQueue();

    const where = staffLinkFindMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ staffId: "p1", status: "ACTIVE", kind: "PRACTITIONER" });
    // never by role — that bug once gave every trainer an empty roster, and here
    // it would be the reverse: a trainer with a review queue.
    expect(JSON.stringify(where)).not.toContain("role");
  });

  it("does not query for requests at all when there are no links", async () => {
    const p = appRouter.createCaller(ctx({ id: "p1", role: "USER", staff: ["PRACTITIONER"] }));
    await p.treatments.reviewQueue();
    expect(treatmentFindMany).not.toHaveBeenCalled();
  });

  it("asks only for REQUESTED rows belonging to those clients", async () => {
    staffLinkFindMany.mockResolvedValue([{ clientId: CLIENT }]);
    const p = appRouter.createCaller(ctx({ id: "p1", role: "USER", staff: ["PRACTITIONER"] }));
    await p.treatments.reviewQueue();

    const where = treatmentFindMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ status: "REQUESTED", userId: { in: [CLIENT] } });
  });
});

describe("deciding", () => {
  const practitioner = () =>
    appRouter.createCaller(ctx({ id: "p1", role: "USER", staff: ["PRACTITIONER"] })).treatments;

  it("is NOT_FOUND for an id that does not exist — never a probe oracle", async () => {
    await expect(
      practitioner().decide({ id: REQ, decision: "APPROVE" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  /**
   * The link is re-read at decision time on purpose: it can be revoked between
   * loading the queue and pressing Approve, and an approval written after that
   * would come from someone who is no longer this client's practitioner.
   */
  it("refuses when the link has been revoked since the queue was loaded", async () => {
    treatmentFindUnique.mockResolvedValue({
      id: REQ,
      userId: CLIENT,
      status: "REQUESTED",
      approvedAt: null,
      protocolSlug: "energy-review",
    });
    staffLinkFindFirst.mockResolvedValue(null); // revoked

    await expect(
      practitioner().decide({ id: REQ, decision: "APPROVE" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(treatmentUpdate).not.toHaveBeenCalled();
  });

  it("refuses to decide a request that was already decided", async () => {
    treatmentFindUnique.mockResolvedValue({
      id: REQ,
      userId: CLIENT,
      status: "DECLINED",
      approvedAt: null,
      protocolSlug: "energy-review",
    });
    staffLinkFindFirst.mockResolvedValue({ id: "link1" });

    await expect(
      practitioner().decide({ id: REQ, decision: "APPROVE" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(treatmentUpdate).not.toHaveBeenCalled();
  });

  it("writes the approval and its audit row together, guarded on the status it read", async () => {
    treatmentFindUnique.mockResolvedValue({
      id: REQ,
      userId: CLIENT,
      status: "REQUESTED",
      approvedAt: null,
      protocolSlug: "energy-review",
    });
    staffLinkFindFirst.mockResolvedValue({ id: "link1" });

    await expect(practitioner().decide({ id: REQ, decision: "APPROVE" })).resolves.toMatchObject({
      ok: true,
      status: "APPROVED",
    });

    const update = treatmentUpdate.mock.calls[0]?.[0];
    // The status guard closes the race between two practitioners deciding at once.
    expect(update.where).toEqual({ id: REQ, status: "REQUESTED" });
    expect(update.data).toMatchObject({ status: "APPROVED", reviewedById: "p1" });
    expect(update.data.approvedAt).toBeInstanceOf(Date);

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const entry = auditCreate.mock.calls[0]?.[0]?.data;
    expect(entry).toMatchObject({
      actorId: "p1",
      subjectId: CLIENT,
      action: "treatment.approved",
      entityId: REQ,
    });
  });

  it("stores the decline reason and leaves approvedAt null", async () => {
    treatmentFindUnique.mockResolvedValue({
      id: REQ,
      userId: CLIENT,
      status: "REQUESTED",
      approvedAt: null,
      protocolSlug: "energy-review",
    });
    staffLinkFindFirst.mockResolvedValue({ id: "link1" });

    await practitioner().decide({ id: REQ, decision: "DECLINE", reason: DECLINE_REASON });

    const data = treatmentUpdate.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({ status: "DECLINED", decisionNote: DECLINE_REASON, approvedAt: null });
    expect(auditCreate.mock.calls[0]?.[0]?.data?.action).toBe("treatment.declined");
  });

  // Health-adjacent free text must not reach the trail.
  it("never puts the decision text into the audit meta", async () => {
    treatmentFindUnique.mockResolvedValue({
      id: REQ,
      userId: CLIENT,
      status: "REQUESTED",
      approvedAt: null,
      protocolSlug: "energy-review",
    });
    staffLinkFindFirst.mockResolvedValue({ id: "link1" });

    await practitioner().decide({ id: REQ, decision: "DECLINE", reason: DECLINE_REASON });
    expect(JSON.stringify(auditCreate.mock.calls[0]?.[0]?.data ?? {})).not.toContain(DECLINE_REASON);
  });
});

describe("asking for a review", () => {
  const client = () => appRouter.createCaller(ctx({ id: "u1", role: "USER" })).treatments;

  /**
   * A request nobody can ever read is not a request. Leaving it in "pending
   * review" forever would be the cruellest lie available in this feature.
   */
  it("is refused when the user has no practitioner", async () => {
    staffLinkFindFirst.mockResolvedValue(null);
    await expect(client().request({ slug: "energy-review" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("is refused when one is already open for the same protocol", async () => {
    staffLinkFindFirst.mockResolvedValue({ id: "link1" });
    treatmentFindFirst.mockResolvedValue({ id: REQ, status: "REQUESTED", approvedAt: null });
    await expect(client().request({ slug: "energy-review" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("looks for the practitioner link by kind and ACTIVE status", async () => {
    staffLinkFindFirst.mockResolvedValue(null);
    await expect(client().request({ slug: "energy-review" })).rejects.toBeTruthy();
    const where = staffLinkFindFirst.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ clientId: "u1", status: "ACTIVE", kind: "PRACTITIONER" });
  });

  it("scopes the caller's own list to their own id", async () => {
    await client().list();
    expect(treatmentFindMany.mock.calls[0]?.[0]?.where).toEqual({ userId: "u1" });
  });

  it("withdrawing is scoped by userId, never by id alone", async () => {
    treatmentFindFirst.mockResolvedValue(null);
    await expect(client().withdraw({ id: REQ })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(treatmentFindFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: REQ, userId: "u1" });
  });

  it("refuses to withdraw something already decided", async () => {
    treatmentFindFirst.mockResolvedValue({
      id: REQ,
      status: "DECLINED",
      approvedAt: null,
      protocolSlug: "energy-review",
    });
    await expect(client().withdraw({ id: REQ })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("two practitioners deciding at once", () => {
  /**
   * The `status: REQUESTED` guard on the update means the loser's write matches
   * no row and Prisma raises P2025. "Someone else got there first" is an
   * explainable outcome, not a server fault, and must not reach the client as
   * one — a practitioner told "something went wrong" would reasonably try again.
   */
  it("tells the loser the request was already decided, not that the server broke", async () => {
    treatmentFindUnique.mockResolvedValue({
      id: REQ,
      userId: CLIENT,
      status: "REQUESTED",
      approvedAt: null,
      protocolSlug: "energy-review",
    });
    staffLinkFindFirst.mockResolvedValue({ id: "link1" });
    treatmentUpdate.mockRejectedValue(Object.assign(new Error("no rows"), { code: "P2025" }));

    const p = appRouter.createCaller(ctx({ id: "p1", role: "USER", staff: ["PRACTITIONER"] }));
    await expect(p.treatments.decide({ id: REQ, decision: "APPROVE" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("does not swallow a genuine database failure", async () => {
    treatmentFindUnique.mockResolvedValue({
      id: REQ,
      userId: CLIENT,
      status: "REQUESTED",
      approvedAt: null,
      protocolSlug: "energy-review",
    });
    staffLinkFindFirst.mockResolvedValue({ id: "link1" });
    treatmentUpdate.mockRejectedValue(new Error("connection reset"));

    const p = appRouter.createCaller(ctx({ id: "p1", role: "USER", staff: ["PRACTITIONER"] }));
    await expect(p.treatments.decide({ id: REQ, decision: "APPROVE" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
