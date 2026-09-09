/**
 * §7 against a REAL database — the half the mocked tests cannot reach.
 *
 * `treatments.test.ts` mocks Prisma and asserts the shape of each query, which
 * proves authorization but proves nothing about whether a write lands. The
 * decide path is the one place in this codebase where that distinction matters:
 * a treatment decision is a clinical act, and `recordAuditTx` makes its audit
 * row atomic with the status change. Whether that transaction actually commits
 * is not something a mock can tell you.
 *
 * So this file drives the whole loop through the real router against the real
 * database: a practitioner, a client, an ACTIVE link, a request, a decision, and
 * then reads the rows back.
 *
 * **Opt-in.** It needs a database and a network, so `pnpm test` must not depend
 * on it — CI and offline work would both break. Run it deliberately:
 *
 *     cd apps/api && RUN_DB_TESTS=1 pnpm exec vitest run src/__tests__/treatments.db.test.ts
 *
 * Every row it creates is namespaced to a per-run uuid and deleted in
 * `afterAll`, including the audit rows, which have no FK and so do not cascade.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { StaffKind, StaffLinkStatus, StaffStatus, TreatmentStatus } from "@prisma/client";
import { prisma } from "../db";
import { appRouter } from "../router";
import type { Context } from "../context";

const RUN = process.env.RUN_DB_TESTS === "1";

/**
 * Vitest defaults to 5s per test and 10s per hook. Every call here is a real
 * round-trip to Supabase over the transaction pooler, and the first one pays
 * connection setup on a free tier that may have been idle — comfortably past
 * both. These numbers are about the network, not about slow code.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 90_000 });

const clientId = randomUUID();
const practitionerId = randomUUID();
const trainerId = randomUUID();
const stamp = Date.now();

/** A real context, built the way `resolveUser` would build one. */
function ctxFor(id: string, staff: StaffKind[] = []): Context {
  return {
    user: {
      id,
      email: `${id}@treatments-db-test.local`,
      role: "USER",
      staff: staff.map((kind) => ({ kind })),
    },
  };
}

describe.skipIf(!RUN)("§7 end to end, against the real database", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: clientId, email: `client-${stamp}@treatments-db-test.local`, fullName: "Test Client" },
        { id: practitionerId, email: `prac-${stamp}@treatments-db-test.local`, fullName: "Test Practitioner" },
        { id: trainerId, email: `pt-${stamp}@treatments-db-test.local`, fullName: "Test Trainer" },
      ],
    });
    await prisma.staffProfile.createMany({
      data: [
        { userId: practitionerId, kind: StaffKind.PRACTITIONER, status: StaffStatus.VERIFIED },
        { userId: trainerId, kind: StaffKind.PT, status: StaffStatus.VERIFIED },
      ],
    });
    // The link is what actually opens the client's record — capability alone
    // never does. Both staff members are linked, so the PT test below fails for
    // the right reason (capability), not for a missing link.
    await prisma.staffLink.createMany({
      data: [
        {
          clientId,
          staffId: practitionerId,
          kind: StaffKind.PRACTITIONER,
          role: "PRACTITIONER",
          status: StaffLinkStatus.ACTIVE,
        },
        {
          clientId,
          staffId: trainerId,
          kind: StaffKind.PT,
          role: "PT",
          status: StaffLinkStatus.ACTIVE,
        },
      ],
    });
  });

  afterAll(async () => {
    // Audit rows carry no FK, so nothing cascades them away.
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [clientId, practitionerId, trainerId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [clientId, practitionerId, trainerId] } },
    });
    await prisma.$disconnect();
  });

  it("a client can ask, and the row lands with a frozen reason", async () => {
    const client = appRouter.createCaller(ctxFor(clientId)).treatments;
    const created = await client.request({ slug: "energy-review", note: "Worth a look?" });

    expect(created.status).toBe("REQUESTED");
    expect(created.canBook).toBe(false);

    const row = await prisma.treatmentRequest.findUnique({ where: { id: created.id } });
    expect(row?.userId).toBe(clientId);
    expect(row?.protocolSlug).toBe("energy-review");
    expect(row?.approvedAt).toBeNull();
    expect(row?.reviewedById).toBeNull();
    // No readings were seeded, so nothing surfaced it — and the reason says so
    // plainly rather than inventing a data-derived justification.
    expect(row?.reason).toContain("You asked for this review yourself");
  });

  it("refuses a second open request for the same protocol", async () => {
    const client = appRouter.createCaller(ctxFor(clientId)).treatments;
    await expect(client.request({ slug: "energy-review" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("shows in the practitioner's queue, and NOT in the trainer's", async () => {
    const prac = appRouter.createCaller(ctxFor(practitionerId, [StaffKind.PRACTITIONER])).treatments;
    const queue = await prac.reviewQueue();
    expect(queue.requests.map((r) => r.slug)).toContain("energy-review");
    expect(queue.requests[0]?.clientId).toBe(clientId);

    // A verified PT holding an ACTIVE link to the same client is still refused.
    const pt = appRouter.createCaller(ctxFor(trainerId, [StaffKind.PT])).treatments;
    await expect(pt.reviewQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  /**
   * The assertion this whole file exists for: the status change and its audit
   * row are written in one transaction, so both are present or neither is.
   */
  it("approving commits the status AND the audit row together", async () => {
    const client = appRouter.createCaller(ctxFor(clientId)).treatments;
    const prac = appRouter.createCaller(ctxFor(practitionerId, [StaffKind.PRACTITIONER])).treatments;

    const open = (await client.list()).requests.find((r) => r.status === "REQUESTED");
    if (!open) throw new Error("no open request to approve");

    await expect(prac.decide({ id: open.id, decision: "APPROVE" })).resolves.toMatchObject({
      ok: true,
      status: "APPROVED",
    });

    const row = await prisma.treatmentRequest.findUnique({ where: { id: open.id } });
    expect(row?.status).toBe(TreatmentStatus.APPROVED);
    expect(row?.reviewedById).toBe(practitionerId);
    expect(row?.approvedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "treatment.approved", entityId: open.id },
    });
    expect(audit, "the audit row must exist — it is the record a person decided").toBeTruthy();
    expect(audit?.actorId).toBe(practitionerId);
    expect(audit?.subjectId).toBe(clientId);
    // Health-adjacent free text must never reach the trail.
    expect(JSON.stringify(audit?.meta ?? {})).not.toContain("energy on");
  });

  it("the client now sees it approved, bookable, and counting down", async () => {
    const client = appRouter.createCaller(ctxFor(clientId)).treatments;
    const approved = (await client.list()).requests.find((r) => r.status === "APPROVED");
    expect(approved?.canBook).toBe(true);
    expect(approved?.expiresInDays).toBeGreaterThan(0);
  });

  it("refuses to decide the same request twice", async () => {
    const prac = appRouter.createCaller(ctxFor(practitionerId, [StaffKind.PRACTITIONER])).treatments;
    const client = appRouter.createCaller(ctxFor(clientId)).treatments;
    const approved = (await client.list()).requests.find((r) => r.status === "APPROVED");
    if (!approved) throw new Error("no approved request");

    await expect(
      prac.decide({ id: approved.id, decision: "APPROVE" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("declining stores the reason, leaves approvedAt null, and audits it", async () => {
    const client = appRouter.createCaller(ctxFor(clientId)).treatments;
    const prac = appRouter.createCaller(ctxFor(practitionerId, [StaffKind.PRACTITIONER])).treatments;
    const reason = "Not clinically appropriate at this time — let us review at your next visit.";

    const created = await client.request({ slug: "sleep-review" });
    await prac.decide({ id: created.id, decision: "DECLINE", reason });

    const row = await prisma.treatmentRequest.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe(TreatmentStatus.DECLINED);
    expect(row?.decisionNote).toBe(reason);
    expect(row?.approvedAt).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "treatment.declined", entityId: created.id },
    });
    expect(audit?.subjectId).toBe(clientId);
    // The reason is health-adjacent free text and belongs only on the row.
    expect(JSON.stringify(audit?.meta ?? {})).not.toContain(reason);
  });

  it("a client can withdraw, and cannot withdraw someone else's", async () => {
    const client = appRouter.createCaller(ctxFor(clientId)).treatments;
    const created = await client.request({ slug: "hydration-review" });
    await expect(client.withdraw({ id: created.id })).resolves.toEqual({ ok: true });

    const row = await prisma.treatmentRequest.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe(TreatmentStatus.WITHDRAWN);

    // Scoped by userId, never by id alone.
    const stranger = appRouter.createCaller(ctxFor(practitionerId)).treatments;
    await expect(stranger.withdraw({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("a revoked link closes the queue immediately", async () => {
    await prisma.staffLink.updateMany({
      where: { staffId: practitionerId, clientId },
      data: { status: StaffLinkStatus.REVOKED },
    });
    const prac = appRouter.createCaller(ctxFor(practitionerId, [StaffKind.PRACTITIONER])).treatments;
    await expect(prac.reviewQueue()).resolves.toEqual({ requests: [] });

    await prisma.staffLink.updateMany({
      where: { staffId: practitionerId, clientId },
      data: { status: StaffLinkStatus.ACTIVE },
    });
  });
});
