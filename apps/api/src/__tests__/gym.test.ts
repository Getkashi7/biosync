/**
 * §6 gym — the invariants a screenshot of a working app would not reveal.
 *
 * Each test here pins a rule rather than a behaviour:
 *
 * - a seat is claimed by a **conditional update**, and no booking is written
 *   when that update matches nothing;
 * - cancelling a class sweeps its bookings in **one** transaction and writes
 *   **one** audit row;
 * - a check-in with no matching booking writes a visit with a null class, and
 *   creates no booking and no `attendedAt`;
 * - `checkInSecret`, `stripeAccountId` and `credential` never appear in a
 *   select whose result reaches a client.
 *
 * Prisma is mocked, so these assert the *shape of the query* — following
 * `staffLink.test.ts` and `treatments.test.ts`. The one thing a mock cannot
 * prove is that two concurrent bookings on a one-seat class produce one seat;
 * that lives in the opt-in `gym.db.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const coachFindMany = vi.fn();
const coachFindFirst = vi.fn();
const coachFindUnique = vi.fn();
const coachUpsert = vi.fn();
const coachUpdateMany = vi.fn();

const venueFindMany = vi.fn();
const venueFindFirst = vi.fn();
const venueFindUnique = vi.fn();

const classFindMany = vi.fn();
const classFindFirst = vi.fn();
const classFindUnique = vi.fn();
const classCreate = vi.fn();
const classUpdate = vi.fn();
const classUpdateMany = vi.fn();

const bookingFindMany = vi.fn();
const bookingFindUnique = vi.fn();
const bookingCreate = vi.fn();
const bookingUpsert = vi.fn();
const bookingUpdate = vi.fn();
const bookingUpdateMany = vi.fn();

const visitFindFirst = vi.fn();
const visitFindMany = vi.fn();
const visitCreate = vi.fn();

const auditCreate = vi.fn();
const transactionCalls = vi.fn();

const client = {
  coachProfile: {
    findMany: (...a: unknown[]) => coachFindMany(...a),
    findFirst: (...a: unknown[]) => coachFindFirst(...a),
    findUnique: (...a: unknown[]) => coachFindUnique(...a),
    upsert: (...a: unknown[]) => coachUpsert(...a),
    updateMany: (...a: unknown[]) => coachUpdateMany(...a),
  },
  venue: {
    findMany: (...a: unknown[]) => venueFindMany(...a),
    findFirst: (...a: unknown[]) => venueFindFirst(...a),
    findUnique: (...a: unknown[]) => venueFindUnique(...a),
  },
  gymClass: {
    findMany: (...a: unknown[]) => classFindMany(...a),
    findFirst: (...a: unknown[]) => classFindFirst(...a),
    findUnique: (...a: unknown[]) => classFindUnique(...a),
    create: (...a: unknown[]) => classCreate(...a),
    update: (...a: unknown[]) => classUpdate(...a),
    updateMany: (...a: unknown[]) => classUpdateMany(...a),
  },
  classBooking: {
    findMany: (...a: unknown[]) => bookingFindMany(...a),
    findUnique: (...a: unknown[]) => bookingFindUnique(...a),
    create: (...a: unknown[]) => bookingCreate(...a),
    upsert: (...a: unknown[]) => bookingUpsert(...a),
    update: (...a: unknown[]) => bookingUpdate(...a),
    updateMany: (...a: unknown[]) => bookingUpdateMany(...a),
  },
  gymVisit: {
    findFirst: (...a: unknown[]) => visitFindFirst(...a),
    findMany: (...a: unknown[]) => visitFindMany(...a),
    create: (...a: unknown[]) => visitCreate(...a),
  },
  auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
};

vi.mock("../db", () => ({
  prisma: {
    ...client,
    // The transaction client is the same set of mocks, so a test can assert
    // *how many* transactions a mutation opened as well as what it did.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCalls();
      return fn(client);
    },
  },
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");
const { currentToken } = await import("../lib/checkIn");

const USER = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const VENUE = "0f1e5a5c-2b5e-4a3f-9c2a-7b1d9e8f0a11";
const CLASS = "9b7d1c3e-5f21-4c0a-8e1b-2d4f6a8c0e22";
const SECRET = "venue-secret-not-in-any-select";
const TODAY = "2026-09-16";

const member = () => appRouter.createCaller(ctx({ id: USER, role: "USER" }));
const coach = () => appRouter.createCaller(ctx({ id: USER, role: "USER", staff: ["PT"] }));

/** A class that is open: an hour away, with seats. */
function openClass(over: Record<string, unknown> = {}) {
  return {
    id: CLASS,
    status: "SCHEDULED",
    startsAt: new Date(Date.now() + 60 * 60_000),
    durationMin: 60,
    capacity: 10,
    seatsTaken: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  coachFindMany.mockResolvedValue([]);
  coachFindFirst.mockResolvedValue(null);
  coachFindUnique.mockResolvedValue(null);
  coachUpsert.mockResolvedValue({ id: "cp1" });
  coachUpdateMany.mockResolvedValue({ count: 1 });
  venueFindMany.mockResolvedValue([]);
  venueFindFirst.mockResolvedValue({ id: VENUE, name: "Arch 12", checkInSecret: SECRET });
  venueFindUnique.mockResolvedValue({ timezone: "Europe/London" });
  classFindMany.mockResolvedValue([]);
  classFindFirst.mockResolvedValue(null);
  classFindUnique.mockResolvedValue(openClass());
  classCreate.mockResolvedValue({ id: CLASS });
  classUpdate.mockResolvedValue({});
  classUpdateMany.mockResolvedValue({ count: 1 });
  bookingFindMany.mockResolvedValue([]);
  bookingFindUnique.mockResolvedValue(null);
  bookingCreate.mockResolvedValue({ id: "b1" });
  bookingUpsert.mockResolvedValue({ id: "b1" });
  bookingUpdate.mockResolvedValue({});
  bookingUpdateMany.mockResolvedValue({ count: 0 });
  visitFindFirst.mockResolvedValue(null);
  visitFindMany.mockResolvedValue([]);
  visitCreate.mockResolvedValue({ id: "v1" });
  auditCreate.mockResolvedValue({});
});

/* ------------------------------------------------------------------ */

describe("who may touch what", () => {
  it("no token → UNAUTHORIZED across the surface", async () => {
    const anon = appRouter.createCaller(ctx(null));
    await expect(anon.gym.coaches({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.gym.schedule({ from: TODAY })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.gym.book({ classId: CLASS })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.gym.checkInManual({ venueId: VENUE })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  /**
   * A class is created by the person who will teach it. A member is refused,
   * and so is an ADMIN — running the platform is not being someone's coach,
   * which is the same line `staffProcedure` draws everywhere else.
   */
  it("a member and an admin are both FORBIDDEN from the coach surface", async () => {
    for (const caller of [
      member(),
      appRouter.createCaller(ctx({ id: "a1", role: "ADMIN" })),
    ]) {
      await expect(
        caller.gym.createClass({
          venueId: VENUE,
          title: "Intervals",
          startsAt: new Date().toISOString(),
          durationMin: 45,
          capacity: 12,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.gym.roster({ classId: CLASS })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(caller.gym.checkInToken({ venueId: VENUE })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });
});

/* ------------------------------------------------------------------ */

describe("the directory only contains people who chose to be in it", () => {
  it("requires the opt-in AND a verified PT capability, in the query", async () => {
    await member().gym.coaches({});
    const where = classOf(coachFindMany.mock.calls[0]?.[0]).where as Record<string, unknown>;
    expect(where.listed).toBe(true);
    expect(JSON.stringify(where)).toContain("VERIFIED");
    expect(JSON.stringify(where)).toContain("PT");
  });

  // Never in the select, so it cannot be in the response by accident.
  it("never selects a Connect account id", async () => {
    await member().gym.coaches({});
    const select = classOf(coachFindMany.mock.calls[0]?.[0]).select as Record<string, unknown>;
    expect(select.stripeAccountId).toBeUndefined();
    expect(select.credential).toBeUndefined();
  });

  it("does not hand a storage path to a client", async () => {
    coachFindMany.mockResolvedValue([
      {
        id: "cp1",
        userId: USER,
        displayName: "Ann",
        bio: null,
        specialties: ["strength"],
        photoPath: `${USER}/coach-1.jpg`,
        bookingUrl: null,
        stripeChargesEnabled: false,
        createdAt: new Date(),
      },
    ]);
    const res = await member().gym.coaches({});
    expect(JSON.stringify(res)).not.toContain("coach-1.jpg");
  });

  /**
   * A Connect account exists long before KYC finishes, so `chargesEnabled` is
   * the only field allowed to gate a payment action — and with neither, the
   * honest answer is that there is no way to book them yet.
   */
  it("offers no booking link until there is one that works", async () => {
    coachFindMany.mockResolvedValue([
      {
        id: "cp1",
        userId: USER,
        displayName: "Ann",
        bio: null,
        specialties: [],
        photoPath: null,
        bookingUrl: null,
        stripeChargesEnabled: false,
        createdAt: new Date(),
      },
    ]);
    const res = await member().gym.coaches({});
    expect(res.coaches[0]?.payments).toBe("NONE");
    expect(res.coaches[0]?.bookingUrl).toBeNull();
    expect(res.coaches[0]?.payoutNote).toBeNull();
  });

  // A paging bug must not degrade into an unfiltered dump of the table.
  it("rejects a malformed cursor rather than returning page one", async () => {
    await expect(member().gym.coaches({ cursor: "not-a-cursor" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(coachFindMany).not.toHaveBeenCalled();
  });

  // A trainer is not a clinician, and a bio is the easiest place to imply it.
  it("refuses a bio that claims clinical work, and names the words", async () => {
    await expect(
      coach().gym.saveCoachProfile({
        displayName: "Ann Coach",
        bio: "I treat back pain with clinical rehabilitation.",
        specialties: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("treat") });
    expect(coachUpsert).not.toHaveBeenCalled();
  });

  // Creating a profile must not publish it. `listed` is a separate decision.
  it("never sets listed when creating a profile", async () => {
    await coach().gym.saveCoachProfile({ displayName: "Ann Coach", specialties: ["strength"] });
    const args = classOf(coachUpsert.mock.calls[0]?.[0]);
    expect((args.create as Record<string, unknown>).listed).toBeUndefined();
    expect((args.update as Record<string, unknown>).listed).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */

describe("a seat is claimed by the write, not by a resolver", () => {
  it("guards the increment on capacity and on the class still being scheduled", async () => {
    await member().gym.book({ classId: CLASS });
    const where = classOf(classUpdateMany.mock.calls[0]?.[0]).where as Record<string, unknown>;
    expect(where.seatsTaken).toEqual({ lt: 10 });
    expect(where.status).toBe("SCHEDULED");
    expect(classOf(classUpdateMany.mock.calls[0]?.[0]).data).toEqual({
      seatsTaken: { increment: 1 },
    });
  });

  /**
   * The race, from the losing side. The read said there was room; by the time
   * the update ran there was not, and the update is the thing that is true.
   * Nothing may be written on top of that.
   */
  it("writes no booking when the conditional update matches nothing", async () => {
    classUpdateMany.mockResolvedValue({ count: 0 });
    await expect(member().gym.book({ classId: CLASS })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "That class is full.",
    });
    expect(bookingUpsert).not.toHaveBeenCalled();
    expect(bookingCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("refuses a full class, a cancelled one and one already under way, each with its own reason", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ seatsTaken: 10 }, "That class is full."],
      [{ status: "CANCELLED" }, "That class was cancelled."],
      [{ startsAt: new Date(Date.now() - 5 * 60_000) }, "That class has already started."],
    ];
    for (const [over, message] of cases) {
      vi.clearAllMocks();
      classFindUnique.mockResolvedValue(openClass(over));
      await expect(member().gym.book({ classId: CLASS })).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message,
      });
      // The seat counter is never touched on a refusal.
      expect(classUpdateMany).not.toHaveBeenCalled();
    }
  });

  it("CONFLICT, not PRECONDITION_FAILED, when it is your own booking in the way", async () => {
    bookingFindUnique.mockResolvedValue({ id: "b1", status: "BOOKED" });
    await expect(member().gym.book({ classId: CLASS })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(classUpdateMany).not.toHaveBeenCalled();
  });

  /**
   * Two of your own devices racing. The unique index is the guard, and the
   * throw rolls the seat increment back with the rest of the transaction —
   * which is why the guard is in the database and not in this file.
   */
  it("maps the unique-index violation to CONFLICT", async () => {
    bookingUpsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dupe", {
        code: "P2002",
        clientVersion: "6.0.0",
      }),
    );
    await expect(member().gym.book({ classId: CLASS })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns the seat to the pool without driving the counter negative", async () => {
    bookingFindUnique.mockResolvedValue({
      id: "b1",
      status: "BOOKED",
      gymClass: openClass(),
    });
    await member().gym.cancelBooking({ classId: CLASS });
    const where = classOf(classUpdateMany.mock.calls[0]?.[0]).where as Record<string, unknown>;
    expect(where.seatsTaken).toEqual({ gt: 0 });
    expect(classOf(classUpdateMany.mock.calls[0]?.[0]).data).toEqual({
      seatsTaken: { decrement: 1 },
    });
  });
});

/* ------------------------------------------------------------------ */

describe("a coach's own classes", () => {
  it("is refused to a member", async () => {
    await expect(member().gym.myClasses({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  /**
   * Scoped by `coachId` in the query, not filtered afterwards. This is the read
   * that would otherwise become "every class, and trust the screen" — and the
   * roster hanging off each one is somebody's attendance.
   */
  it("asks only for classes the caller teaches", async () => {
    await coach().gym.myClasses({});
    const where = classOf(classFindMany.mock.calls[0]?.[0]).where as Record<string, unknown>;
    expect(where.coachId).toBe(USER);
  });

  it("reports how full each one is without exposing who is on it", async () => {
    classFindMany.mockResolvedValue([
      {
        id: CLASS,
        title: "Intervals",
        startsAt: new Date(Date.now() + 3_600_000),
        durationMin: 45,
        capacity: 12,
        seatsTaken: 5,
        status: "SCHEDULED",
        cancelReason: null,
        venue: { id: VENUE, name: "Arch 12" },
      },
    ]);
    const res = await coach().gym.myClasses({});
    expect(res.classes[0]).toMatchObject({ booked: 5, seatsLeft: 7, state: "OPEN" });
    // Names live behind `roster`, which is its own authorized read.
    expect(JSON.stringify(res)).not.toContain("people");
  });
});

/* ------------------------------------------------------------------ */

describe("cancelling a class", () => {
  beforeEach(() => {
    classFindFirst.mockResolvedValue({ id: CLASS, status: "SCHEDULED" });
    bookingUpdateMany.mockResolvedValue({ count: 7 });
  });

  /**
   * One act by one person, so one audit row — with the count in the metadata.
   * Forty rows saying the same thing obscures the trail rather than explaining
   * it, and the trail is the thing an access review reads.
   */
  it("sweeps every booking in one transaction and writes exactly one audit row", async () => {
    const res = await coach().gym.cancelClass({ id: CLASS, reason: "Coach is unwell today." });
    expect(res.bookingsCancelled).toBe(7);
    expect(transactionCalls).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const data = classOf(auditCreate.mock.calls[0]?.[0]).data as Record<string, unknown>;
    expect(data.action).toBe("class.cancelled");
    expect(data.meta).toEqual({ bookings: 7 });
  });

  it("only sweeps bookings that are still live", async () => {
    await coach().gym.cancelClass({ id: CLASS, reason: "Coach is unwell today." });
    const where = classOf(bookingUpdateMany.mock.calls[0]?.[0]).where as Record<string, unknown>;
    expect(where.status).toBe("BOOKED");
  });

  // Someone else's class id is not confirmed as existing by the error.
  it("is NOT_FOUND for a class that is not the caller's", async () => {
    classFindFirst.mockResolvedValue(null);
    await expect(
      coach().gym.cancelClass({ id: CLASS, reason: "Coach is unwell today." }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/* ------------------------------------------------------------------ */

describe("check-in", () => {
  it("records a visit with no class, and invents no booking", async () => {
    const res = await member().gym.checkInManual({ venueId: VENUE });

    const data = classOf(visitCreate.mock.calls[0]?.[0]).data as Record<string, unknown>;
    expect(data.classId).toBeNull();
    expect(data.source).toBe("MANUAL");
    // The two writes that must not happen.
    expect(bookingCreate).not.toHaveBeenCalled();
    expect(bookingUpsert).not.toHaveBeenCalled();
    expect(bookingUpdateMany).not.toHaveBeenCalled();
    // The copy names the venue, because that is all we know.
    expect(res.matchedClass).toBeNull();
    expect(res.venue).toBe("Arch 12");
    // And the time it was recorded, which the success screen prints.
    expect(Number.isNaN(new Date(res.at).getTime())).toBe(false);
  });

  it("attaches to a class the member had already booked, and only then sets attendance", async () => {
    const soon = new Date(Date.now() + 10 * 60_000);
    bookingFindMany.mockResolvedValue([
      { gymClass: { id: CLASS, title: "Intervals", startsAt: soon, durationMin: 45 } },
    ]);
    const res = await member().gym.checkInManual({ venueId: VENUE });

    expect(classOf(visitCreate.mock.calls[0]?.[0]).data).toMatchObject({ classId: CLASS });
    const args = classOf(bookingUpdateMany.mock.calls[0]?.[0]);
    expect(args.data).toMatchObject({ status: "ATTENDED" });
    // Guarded on the booking still being BOOKED, so it cannot overwrite a
    // cancellation that happened in between.
    expect((args.where as Record<string, unknown>).status).toBe("BOOKED");
    expect(res.matchedClass).toBe("Intervals");
  });

  /**
   * Only classes this person booked are candidates. Being in the building
   * while a class runs is not attending it.
   */
  it("considers only the caller's own live bookings at that venue", async () => {
    await member().gym.checkInManual({ venueId: VENUE });
    const where = classOf(bookingFindMany.mock.calls[0]?.[0]).where as Record<string, unknown>;
    expect(where.userId).toBe(USER);
    expect(where.status).toBe("BOOKED");
    expect(where.gymClass).toMatchObject({ venueId: VENUE, status: "SCHEDULED" });
  });

  // Scanning twice because the first beep was ambiguous is one visit.
  it("returns the earlier visit inside the dedupe window rather than writing another", async () => {
    const earlier = new Date("2026-09-16T06:54:00.000Z");
    visitFindFirst.mockResolvedValue({ id: "v-earlier", checkedInAt: earlier, gymClass: null });
    const res = await member().gym.checkInManual({ venueId: VENUE });
    expect(res.alreadyCheckedIn).toBe(true);
    expect(res.id).toBe("v-earlier");
    expect(visitCreate).not.toHaveBeenCalled();
    // The EARLIER visit's time, not now — "your 06:54 check-in still stands" is
    // only true if it reports 06:54.
    expect(res.at).toBe(earlier.toISOString());
  });

  it("accepts a token this venue is actually showing", async () => {
    const token = currentToken(VENUE, SECRET);
    const res = await member().gym.checkInScan({ token });
    expect(res.venue).toBe("Arch 12");
    expect(classOf(visitCreate.mock.calls[0]?.[0]).data).toMatchObject({ source: "QR" });
  });

  it("refuses a token signed with anything else, and writes nothing", async () => {
    const token = currentToken(VENUE, "some-other-secret");
    await expect(member().gym.checkInScan({ token })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(visitCreate).not.toHaveBeenCalled();
  });

  it("refuses a token from a window well outside the skew", async () => {
    const stale = currentToken(VENUE, SECRET, Date.now() - 10 * 60_000);
    await expect(member().gym.checkInScan({ token: stale })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

/* ------------------------------------------------------------------ */

describe("secrets stay on the server", () => {
  it("the venue list never selects the check-in secret", async () => {
    await member().gym.venues();
    const select = classOf(venueFindMany.mock.calls[0]?.[0]).select as Record<string, unknown>;
    expect(select.checkInSecret).toBeUndefined();
  });

  /**
   * `checkInToken` is the one read that touches the secret, and it returns a
   * token rather than the key — a display needs the former and never the
   * latter.
   */
  it("the token endpoint returns a token, not the secret", async () => {
    const res = await coach().gym.checkInToken({ venueId: VENUE });
    expect(res.token).not.toContain(SECRET);
    expect(res.token.startsWith("BIOSYNC1:")).toBe(true);
  });

  // A roster is a list of names. Health data crosses the staff surface, where
  // a link and a consent are checked — not here.
  it("a roster selects no health data", async () => {
    classFindFirst.mockResolvedValue({ id: CLASS, title: "Intervals", capacity: 10, seatsTaken: 3 });
    await coach().gym.roster({ classId: CLASS });
    const select = JSON.stringify(classOf(bookingFindMany.mock.calls[0]?.[0]).select);
    for (const forbidden of ["metric", "dailyLog", "readiness", "note", "photo"]) {
      expect(select.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

/** Narrow a mock call argument without repeating the cast at every use. */
function classOf(arg: unknown): Record<string, unknown> {
  return (arg ?? {}) as Record<string, unknown>;
}
