/**
 * §6 against a REAL database — the one invariant a mock cannot prove.
 *
 * `gym.test.ts` mocks Prisma and asserts that the seat claim is a conditional
 * update carrying `seatsTaken: { lt: capacity }`. That is the right shape, and
 * it is still only a shape: whether two people hitting Book at the same instant
 * end up with one seat or two is a question about row locks in Postgres, and no
 * amount of mocking answers it. A capacity that holds in tests and fails on a
 * busy Monday evening is worse than no capacity at all, because the gym only
 * discovers it when eleven people turn up to a ten-person class.
 *
 * So this file races two real bookings against a real one-seat class through
 * the real router, and reads the rows back.
 *
 * **Opt-in**, for the same reason as `treatments.db.test.ts` — `pnpm test` must
 * stay DB-free so CI and offline work never wait on Supabase:
 *
 *     cd apps/api && RUN_DB_TESTS=1 pnpm exec vitest run src/__tests__/gym.db.test.ts
 *
 * Every row is namespaced to a per-run uuid and deleted in `afterAll`, audit
 * rows included — they have no FK and do not cascade.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { BookingStatus, ClassStatus, StaffKind, StaffStatus } from "@prisma/client";
import { prisma } from "../db";
import { appRouter } from "../router";
import type { Context } from "../context";

const RUN = process.env.RUN_DB_TESTS === "1";

/**
 * Every call here is a real round-trip over the transaction pooler, and the
 * first pays connection setup on a free tier that may have been idle. These
 * numbers are about the network, not about slow code — raise them rather than
 * vitest's global ones.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 90_000 });

const coachId = randomUUID();
const memberA = randomUUID();
const memberB = randomUUID();
const venueId = randomUUID();
const stamp = Date.now();

const userIds = [coachId, memberA, memberB];
const classIds: string[] = [];

function ctxFor(id: string, staff: StaffKind[] = []): Context {
  return {
    user: {
      id,
      email: `${id}@gym-db-test.local`,
      role: "USER",
      staff: staff.map((kind) => ({ kind })),
    },
  };
}

/** A class starting in an hour, so nothing here depends on the wall clock. */
async function makeClass(capacity: number): Promise<string> {
  const created = await prisma.gymClass.create({
    data: {
      venueId,
      coachId,
      title: `Race test ${randomUUID().slice(0, 8)}`,
      startsAt: new Date(Date.now() + 60 * 60_000),
      durationMin: 45,
      capacity,
    },
    select: { id: true },
  });
  classIds.push(created.id);
  return created.id;
}

describe.skipIf(!RUN)("§6 capacity, against the real database", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: coachId, email: `coach-${stamp}@gym-db-test.local`, fullName: "Test Coach" },
        { id: memberA, email: `a-${stamp}@gym-db-test.local`, fullName: "Member A" },
        { id: memberB, email: `b-${stamp}@gym-db-test.local`, fullName: "Member B" },
      ],
    });
    await prisma.staffProfile.create({
      data: { userId: coachId, kind: StaffKind.PT, status: StaffStatus.VERIFIED },
    });
    await prisma.venue.create({
      data: {
        id: venueId,
        name: `Test Arch ${stamp}`,
        timezone: "Europe/London",
        checkInSecret: randomUUID(),
      },
    });
  });

  afterAll(async () => {
    // Order matters: Venue is Restrict from both classes and visits.
    await prisma.gymVisit.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.classBooking.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.gymClass.deleteMany({ where: { venueId } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await prisma.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    // No FK, so these do not cascade with the users.
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  /**
   * The whole reason this file exists.
   *
   * Both callers read a class with a free seat, and both then try to take it.
   * The conditional update serialises them on the row lock, so the second one
   * finds `seatsTaken < capacity` false and matches nothing — and because the
   * booking is written inside the same transaction, the loser writes no row at
   * all rather than a booking against a seat they do not have.
   */
  it("two people racing for one seat produce exactly one booking", async () => {
    const classId = await makeClass(1);

    const results = await Promise.allSettled([
      appRouter.createCaller(ctxFor(memberA)).gym.book({ classId }),
      appRouter.createCaller(ctxFor(memberB)).gym.book({ classId }),
    ]);

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    // The world's state refused them, not their own prior action.
    expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    const cls = await prisma.gymClass.findUnique({
      where: { id: classId },
      select: { seatsTaken: true },
    });
    expect(cls?.seatsTaken).toBe(1);

    const booked = await prisma.classBooking.findMany({
      where: { classId, status: BookingStatus.BOOKED },
    });
    expect(booked).toHaveLength(1);
  });

  /** Cancelling gives the seat back, and the next person can take it. */
  it("a cancellation returns the seat to the pool", async () => {
    const classId = await makeClass(1);
    const a = appRouter.createCaller(ctxFor(memberA)).gym;
    const b = appRouter.createCaller(ctxFor(memberB)).gym;

    await a.book({ classId });
    await expect(b.book({ classId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    await a.cancelBooking({ classId });
    await expect(b.book({ classId })).resolves.toMatchObject({ id: expect.any(String) });

    const cls = await prisma.gymClass.findUnique({
      where: { id: classId },
      select: { seatsTaken: true },
    });
    expect(cls?.seatsTaken).toBe(1);
  });

  /**
   * Booking the same class twice is your own action blocking you — CONFLICT,
   * and the seat count must not move for the second attempt.
   */
  it("a second booking by the same person is CONFLICT and takes no seat", async () => {
    const classId = await makeClass(5);
    const a = appRouter.createCaller(ctxFor(memberA)).gym;

    await a.book({ classId });
    await expect(a.book({ classId })).rejects.toMatchObject({ code: "CONFLICT" });

    const cls = await prisma.gymClass.findUnique({
      where: { id: classId },
      select: { seatsTaken: true },
    });
    expect(cls?.seatsTaken).toBe(1);
  });

  /**
   * Cancelling a class sweeps its bookings and writes ONE audit row, whatever
   * the roster size — the property the mocked test asserts on a mock, proven
   * here against rows that actually committed.
   */
  it("cancelling a class cancels every booking and records the act once", async () => {
    const classId = await makeClass(5);
    await appRouter.createCaller(ctxFor(memberA)).gym.book({ classId });
    await appRouter.createCaller(ctxFor(memberB)).gym.book({ classId });

    const res = await appRouter
      .createCaller(ctxFor(coachId, [StaffKind.PT]))
      .gym.cancelClass({ id: classId, reason: "Coach is unwell today." });
    expect(res.bookingsCancelled).toBe(2);

    const cls = await prisma.gymClass.findUnique({
      where: { id: classId },
      select: { status: true, cancelReason: true },
    });
    expect(cls?.status).toBe(ClassStatus.CANCELLED);
    expect(cls?.cancelReason).toBe("Coach is unwell today.");

    const stillBooked = await prisma.classBooking.count({
      where: { classId, status: BookingStatus.BOOKED },
    });
    expect(stillBooked).toBe(0);

    const audits = await prisma.auditLog.count({
      where: { action: "class.cancelled", entityId: classId },
    });
    expect(audits).toBe(1);

    // And a cancelled class cannot be booked.
    await expect(
      appRouter.createCaller(ctxFor(memberA)).gym.book({ classId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  /**
   * A check-in with nothing booked is still a real visit. It must leave no
   * booking behind and no attendance — the claim "you attended a class" is one
   * this app may only make when the person chose to be on it.
   */
  it("a check-in with no booking writes a visit and nothing else", async () => {
    const before = await prisma.classBooking.count({ where: { userId: memberB } });

    const res = await appRouter.createCaller(ctxFor(memberB)).gym.checkInManual({ venueId });
    expect(res.matchedClass).toBeNull();
    expect(res.alreadyCheckedIn).toBe(false);

    const visit = await prisma.gymVisit.findUnique({
      where: { id: res.id },
      select: { classId: true, source: true },
    });
    expect(visit?.classId).toBeNull();
    expect(visit?.source).toBe("MANUAL");

    expect(await prisma.classBooking.count({ where: { userId: memberB } })).toBe(before);
    expect(
      await prisma.classBooking.count({ where: { userId: memberB, attendedAt: { not: null } } }),
    ).toBe(0);

    // A second scan inside the dedupe window is the same visit, not a new one.
    const again = await appRouter.createCaller(ctxFor(memberB)).gym.checkInManual({ venueId });
    expect(again.alreadyCheckedIn).toBe(true);
    expect(again.id).toBe(res.id);
  });
});
