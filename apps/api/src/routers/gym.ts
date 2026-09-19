/**
 * Fitness & gym (§6) — the coach directory, classes, bookings and check-in.
 *
 * Three rules shape this file.
 *
 * **A capability is not an advertisement.** The directory requires both a
 * VERIFIED PT `StaffProfile` and the coach's own `listed` opt-in, expressed in
 * the query rather than filtered afterwards — so granting someone a capability
 * never publishes them, and a suspension delists them on the next read with no
 * backfill job. `credential` is never selected here: it lives on the permission
 * record, which this file does not read.
 *
 * **Capacity is enforced by the write, not by a resolver.** Booking is a
 * conditional update guarded on `seatsTaken < capacity` inside a transaction,
 * so a row lock decides who gets the last seat. Count-then-insert is the version
 * that lets two people take it, and no amount of checking first repairs that.
 *
 * **BIOSYNC takes no money.** Booking a coach opens their own page — the same
 * hand-off posture as §7's clinic link. Nothing here has a price, and nothing
 * financial keys off a check-in, because a check-in proves less than it looks
 * like it proves (see `lib/checkIn.ts`).
 */
import { BookingStatus, CheckInSource, ClassStatus, Prisma, StaffStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  AUDIT,
  CHECKIN_DEDUPE_MINUTES,
  bioClaimFlags,
  canCancelBooking,
  checkInManualInput,
  checkInScanInput,
  classCancelInput,
  classCreateInput,
  classForCheckIn,
  classIdInput,
  classState,
  coachIdInput,
  coachListInput,
  coachListedInput,
  coachPayments,
  coachProfileInput,
  dayWindow,
  decodeCursor,
  gymTimelineInput,
  keysetWhere,
  myClassesInput,
  nextCursor,
  payoutNote,
  scheduleInput,
  seatsLeft,
  venueIdInput,
} from "@pulse/shared";
import { router, ownerProcedure, coachProcedure } from "../trpc";
import { prisma } from "../db";
import { recordAudit } from "../lib/audit";
import { currentToken, verifyCheckInToken } from "../lib/checkIn";
import { DEFAULT_TIMEZONE, zoneOffsetMinutes } from "../lib/timezone";

/** Coaches come back a page at a time, like every other growing list here. */
const COACH_PAGE = 20;

/**
 * What a client may see of a coach.
 *
 * Absent on purpose: `stripeAccountId` (an account id exists long before KYC,
 * so it is not evidence of anything a client should act on) and `listed` (the
 * directory query already only returns listed coaches; repeating the flag
 * invites a screen to trust it instead).
 */
const PUBLIC_COACH_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  bio: true,
  specialties: true,
  photoPath: true,
  bookingUrl: true,
  stripeChargesEnabled: true,
  createdAt: true,
} as const;

/** Listed by the coach AND currently VERIFIED as a PT. Both, every time. */
const LISTABLE: Prisma.CoachProfileWhereInput = {
  listed: true,
  user: { staffProfiles: { some: { kind: "PT", status: StaffStatus.VERIFIED } } },
};

type CoachRow = {
  userId: string;
  displayName: string;
  bio: string | null;
  specialties: string[];
  bookingUrl: string | null;
  stripeChargesEnabled: boolean;
};

/** One shape for the directory and the single-coach read, so they cannot drift. */
function publicCoach(c: CoachRow) {
  const payments = coachPayments(c);
  return {
    userId: c.userId,
    displayName: c.displayName,
    bio: c.bio,
    specialties: c.specialties,
    payments,
    // The claim about where the money goes is derived, never typed into a screen.
    payoutNote: payoutNote(payments),
    bookingUrl: payments === "EXTERNAL_LINK" ? c.bookingUrl : null,
  };
}

function badCursor(): never {
  throw new TRPCError({ code: "BAD_REQUEST", message: "That page link isn't valid." });
}

export const gymRouter = router({
  /* ---------------------------------------------------------------- */
  /* Coaches                                                          */
  /* ---------------------------------------------------------------- */

  /** The public directory. */
  coaches: ownerProcedure.input(coachListInput).query(async ({ input }) => {
    const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor);
    // A bad cursor is rejected rather than degraded to page one: a paging bug
    // must not quietly become an unfiltered dump.
    if (input.cursor !== undefined && cursor === null) badCursor();

    const filters: Prisma.CoachProfileWhereInput = input.specialty
      ? { ...LISTABLE, specialties: { has: input.specialty } }
      : LISTABLE;

    const keyset = keysetWhere(cursor);
    const rows = await prisma.coachProfile.findMany({
      where: keyset ? { AND: [filters, keyset] } : filters,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: COACH_PAGE + 1,
      select: PUBLIC_COACH_SELECT,
    });

    const { page, cursor: next } = nextCursor(rows, COACH_PAGE, (r) => r.createdAt);
    return { coaches: page.map(publicCoach), cursor: next };
  }),

  /** One coach. Same filter, same select, same omissions. */
  coach: ownerProcedure.input(coachIdInput).query(async ({ input }) => {
    const c = await prisma.coachProfile.findFirst({
      where: { ...LISTABLE, userId: input.userId },
      select: PUBLIC_COACH_SELECT,
    });
    if (!c) throw new TRPCError({ code: "NOT_FOUND" });
    return publicCoach(c);
  }),

  /** The caller's own profile, listed or not — this is the edit screen's read. */
  myCoachProfile: coachProcedure.query(async ({ ctx }) => {
    const profile = await prisma.coachProfile.findUnique({
      where: { userId: ctx.user.id },
      select: { ...PUBLIC_COACH_SELECT, listed: true },
    });
    return { profile };
  }),

  /**
   * Save the caller's own profile.
   *
   * A bio claiming clinical work is refused and the words are named, so the
   * coach can rewrite rather than guess at what offended. A trainer is not a
   * clinician, and a bio is the easiest place in the app to imply otherwise.
   */
  saveCoachProfile: coachProcedure.input(coachProfileInput).mutation(async ({ ctx, input }) => {
    const flagged = input.bio ? bioClaimFlags(input.bio) : [];
    if (flagged.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `A coach profile can't claim clinical work. Please remove: ${flagged.join(", ")}.`,
      });
    }

    const data = {
      displayName: input.displayName,
      bio: input.bio ?? null,
      specialties: input.specialties,
      bookingUrl: input.bookingUrl ?? null,
    };
    const saved = await prisma.coachProfile.upsert({
      where: { userId: ctx.user.id },
      // Deliberately absent from `create`: `listed`. A new profile is private
      // until its owner says otherwise, and the column default agrees.
      create: { userId: ctx.user.id, ...data },
      update: data,
      select: { id: true },
    });
    return { id: saved.id };
  }),

  /** Appear in the directory, or stop appearing. The coach's own decision. */
  setListed: coachProcedure.input(coachListedInput).mutation(async ({ ctx, input }) => {
    const { count } = await prisma.coachProfile.updateMany({
      where: { userId: ctx.user.id },
      data: { listed: input.listed },
    });
    if (count === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Add your coach profile before listing yourself.",
      });
    }
    await recordAudit({
      actorId: ctx.user.id,
      action: input.listed ? AUDIT.coachListed : AUDIT.coachUnlisted,
      entity: "coachProfile",
    });
    return { ok: true as const, listed: input.listed };
  }),

  /* ---------------------------------------------------------------- */
  /* Venues and classes                                               */
  /* ---------------------------------------------------------------- */

  /** Places, for a schedule filter and for manual check-in. Never the secret. */
  venues: ownerProcedure.query(async () => {
    const venues = await prisma.venue.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: 100,
      select: { id: true, name: true, address: true, timezone: true },
    });
    return { venues };
  }),

  /**
   * The schedule, plus whether the caller is on each class.
   *
   * `state` is computed rather than stored: a class that has started is not
   * "full", and the screen has to say which of the two it is or the member is
   * left guessing why the button went away.
   */
  schedule: ownerProcedure.input(scheduleInput).query(async ({ ctx, input }) => {
    const venue = input.venueId
      ? await prisma.venue.findUnique({
          where: { id: input.venueId },
          select: { timezone: true },
        })
      : null;
    // A day is a local day. With no venue chosen there is no single zone to be
    // right about, so we use the one the gym is in rather than UTC — which
    // would put a 00:30 class on the wrong day for everybody.
    const offset = zoneOffsetMinutes(venue?.timezone ?? DEFAULT_TIMEZONE);
    const window = dayWindow(input.from, input.days, offset);

    const rows = await prisma.gymClass.findMany({
      where: {
        startsAt: window,
        ...(input.venueId ? { venueId: input.venueId } : {}),
      },
      orderBy: { startsAt: "asc" },
      take: 200,
      select: {
        id: true,
        title: true,
        description: true,
        startsAt: true,
        durationMin: true,
        capacity: true,
        seatsTaken: true,
        status: true,
        cancelReason: true,
        venue: { select: { id: true, name: true, timezone: true } },
        coach: { select: { id: true, fullName: true } },
        // Scoped to the caller, so one query also answers "am I on it?".
        bookings: { where: { userId: ctx.user.id }, select: { status: true } },
      },
    });

    const now = new Date();
    return {
      classes: rows.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        startsAt: c.startsAt.toISOString(),
        durationMin: c.durationMin,
        venue: c.venue,
        coach: c.coach?.fullName ?? null,
        state: classState(c, now),
        seatsLeft: seatsLeft(c),
        capacity: c.capacity,
        cancelReason: c.cancelReason,
        yourBooking: c.bookings[0]?.status ?? null,
      })),
    };
  }),

  /**
   * A coach's own classes, upcoming first.
   *
   * Separate from `schedule` rather than a flag on it. `schedule` is the member
   * read — every class at a venue — and teaching a class is a different question
   * from attending one. Folding them together would mean one resolver whose
   * result set depends on who is asking, which is the shape that eventually
   * leaks somebody else's roster.
   */
  myClasses: coachProcedure.input(myClassesInput).query(async ({ ctx, input }) => {
    const offset = zoneOffsetMinutes(DEFAULT_TIMEZONE);
    const window = dayWindow(input.from ?? todayIn(offset), input.days, offset);

    const rows = await prisma.gymClass.findMany({
      where: { coachId: ctx.user.id, startsAt: window },
      orderBy: { startsAt: "asc" },
      take: 200,
      select: {
        id: true,
        title: true,
        startsAt: true,
        durationMin: true,
        capacity: true,
        seatsTaken: true,
        status: true,
        cancelReason: true,
        venue: { select: { id: true, name: true } },
      },
    });

    const now = new Date();
    return {
      classes: rows.map((c) => ({
        id: c.id,
        title: c.title,
        startsAt: c.startsAt.toISOString(),
        durationMin: c.durationMin,
        venue: c.venue,
        capacity: c.capacity,
        booked: c.capacity - seatsLeft(c),
        seatsLeft: seatsLeft(c),
        state: classState(c, now),
        cancelReason: c.cancelReason,
      })),
    };
  }),

  /** Schedule a class. A coach, for themselves — see `coachProcedure`. */
  createClass: coachProcedure.input(classCreateInput).mutation(async ({ ctx, input }) => {
    const venue = await prisma.venue.findFirst({
      where: { id: input.venueId, active: true },
      select: { id: true },
    });
    if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "No such venue." });

    const created = await prisma.gymClass.create({
      data: {
        venueId: input.venueId,
        coachId: ctx.user.id,
        title: input.title,
        description: input.description ?? null,
        startsAt: new Date(input.startsAt),
        durationMin: input.durationMin,
        capacity: input.capacity,
      },
      select: { id: true },
    });
    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.classCreated,
      entity: "gymClass",
      entityId: created.id,
      meta: { capacity: input.capacity },
    });
    return { id: created.id };
  }),

  /**
   * Cancel a class, and everyone's booking on it, in one transaction.
   *
   * One audit row, not one per booking. This was a single act by a single
   * person; a trail that records it forty times obscures rather than explains,
   * and the count is in the metadata for anyone who needs it.
   */
  cancelClass: coachProcedure.input(classCancelInput).mutation(async ({ ctx, input }) => {
    const cls = await prisma.gymClass.findFirst({
      where: { id: input.id, coachId: ctx.user.id },
      select: { id: true, status: true },
    });
    // NOT_FOUND rather than FORBIDDEN: someone else's class id should not be
    // confirmed as existing by the error we hand back.
    if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
    if (cls.status === ClassStatus.CANCELLED) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "That class is already cancelled.",
      });
    }

    const bookingsCancelled = await prisma.$transaction(async (tx) => {
      await tx.gymClass.update({
        where: { id: cls.id },
        data: { status: ClassStatus.CANCELLED, cancelReason: input.reason },
      });
      const { count } = await tx.classBooking.updateMany({
        where: { classId: cls.id, status: BookingStatus.BOOKED },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      });
      return count;
    });

    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.classCancelled,
      entity: "gymClass",
      entityId: cls.id,
      meta: { bookings: bookingsCancelled },
    });
    return { ok: true as const, bookingsCancelled };
  }),

  /**
   * Who is coming. A coach's own class, and names only.
   *
   * No health data crosses this boundary. A coach who is also someone's linked
   * PT reads their data through the staff surface, where a link and a consent
   * are both checked — a roster is not a route around that.
   */
  roster: coachProcedure.input(classIdInput).query(async ({ ctx, input }) => {
    const cls = await prisma.gymClass.findFirst({
      where: { id: input.classId, coachId: ctx.user.id },
      select: { id: true, title: true, capacity: true, seatsTaken: true },
    });
    if (!cls) throw new TRPCError({ code: "NOT_FOUND" });

    const bookings = await prisma.classBooking.findMany({
      where: { classId: cls.id },
      orderBy: { bookedAt: "asc" },
      take: 200,
      select: {
        status: true,
        attendedAt: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    return {
      title: cls.title,
      seatsLeft: seatsLeft(cls),
      people: bookings.map((b) => ({
        id: b.user.id,
        name: b.user.fullName ?? b.user.email,
        status: b.status,
        attended: b.attendedAt !== null,
      })),
    };
  }),

  /* ---------------------------------------------------------------- */
  /* Bookings                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Take a seat.
   *
   * The seat is claimed by a conditional update — `seatsTaken < capacity` on a
   * SCHEDULED class — inside a transaction. That compare-and-increment takes a
   * row lock, which is what makes overbooking impossible rather than unlikely.
   * The `classState` check above it exists to produce a useful message; the
   * update is the thing that is actually true.
   *
   * The two failure codes mean different things and are not interchangeable:
   * CONFLICT is "your own prior action blocks this", PRECONDITION_FAILED is
   * "the world's state does".
   */
  book: ownerProcedure.input(classIdInput).mutation(async ({ ctx, input }) => {
    let id: string;
    try {
      id = await prisma.$transaction(async (tx) => {
        const existing = await tx.classBooking.findUnique({
          where: { classId_userId: { classId: input.classId, userId: ctx.user.id } },
          select: { id: true, status: true },
        });
        if (existing?.status === BookingStatus.BOOKED) {
          throw new TRPCError({ code: "CONFLICT", message: "You're already booked on this class." });
        }

        const cls = await tx.gymClass.findUnique({
          where: { id: input.classId },
          select: {
            id: true,
            status: true,
            startsAt: true,
            durationMin: true,
            capacity: true,
            seatsTaken: true,
          },
        });
        if (!cls) throw new TRPCError({ code: "NOT_FOUND" });

        const state = classState(cls);
        if (state !== "OPEN") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              state === "CANCELLED"
                ? "That class was cancelled."
                : state === "FULL"
                  ? "That class is full."
                  : "That class has already started.",
          });
        }

        const claimed = await tx.gymClass.updateMany({
          where: {
            id: cls.id,
            status: ClassStatus.SCHEDULED,
            seatsTaken: { lt: cls.capacity },
          },
          data: { seatsTaken: { increment: 1 } },
        });
        // Someone else took the last seat between the read and this write. The
        // read was advisory; this is the answer.
        if (claimed.count === 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That class is full." });
        }

        const booking = await tx.classBooking.upsert({
          where: { classId_userId: { classId: cls.id, userId: ctx.user.id } },
          create: { classId: cls.id, userId: ctx.user.id, status: BookingStatus.BOOKED },
          update: { status: BookingStatus.BOOKED, cancelledAt: null },
          select: { id: true },
        });
        return booking.id;
      });
    } catch (err) {
      // Two of the caller's own devices raced. The unique index caught it, and
      // throwing rolls the seat increment back along with everything else in
      // the transaction — which is precisely why that guard lives in the
      // database. Same shape as `treatments.decide` mapping P2025.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new TRPCError({ code: "CONFLICT", message: "You're already booked on this class." });
      }
      throw err;
    }

    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.bookingCreated,
      entity: "classBooking",
      entityId: id,
    });
    return { id };
  }),

  /** Give the seat back. It returns to the pool in the same transaction. */
  cancelBooking: ownerProcedure.input(classIdInput).mutation(async ({ ctx, input }) => {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.classBooking.findUnique({
        where: { classId_userId: { classId: input.classId, userId: ctx.user.id } },
        select: {
          id: true,
          status: true,
          gymClass: {
            select: {
              status: true,
              startsAt: true,
              durationMin: true,
              capacity: true,
              seatsTaken: true,
            },
          },
        },
      });
      if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
      if (booking.status !== BookingStatus.BOOKED) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That booking isn't active." });
      }
      if (!canCancelBooking(booking.gymClass)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "That class has already started.",
        });
      }

      await tx.classBooking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      });
      // Guarded rather than unconditional, so a counter that has drifted to
      // zero cannot be driven negative by a cancellation.
      await tx.gymClass.updateMany({
        where: { id: input.classId, seatsTaken: { gt: 0 } },
        data: { seatsTaken: { decrement: 1 } },
      });
    });

    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.bookingCancelled,
      entity: "classBooking",
      entityId: input.classId,
    });
    return { ok: true as const };
  }),

  /** The caller's own bookings. */
  myBookings: ownerProcedure.query(async ({ ctx }) => {
    const rows = await prisma.classBooking.findMany({
      where: { userId: ctx.user.id, status: { in: [BookingStatus.BOOKED, BookingStatus.ATTENDED] } },
      orderBy: { bookedAt: "desc" },
      take: 50,
      select: {
        status: true,
        attendedAt: true,
        gymClass: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            durationMin: true,
            status: true,
            cancelReason: true,
            venue: { select: { name: true } },
          },
        },
      },
    });
    return {
      bookings: rows.map((b) => ({
        classId: b.gymClass.id,
        title: b.gymClass.title,
        startsAt: b.gymClass.startsAt.toISOString(),
        durationMin: b.gymClass.durationMin,
        venue: b.gymClass.venue.name,
        status: b.status,
        // Why it is not happening, not merely that it is not. A cancellation
        // without a reason is a notification rather than an explanation.
        cancelledReason:
          b.gymClass.status === ClassStatus.CANCELLED ? b.gymClass.cancelReason : null,
        attended: b.attendedAt !== null,
      })),
    };
  }),

  /* ---------------------------------------------------------------- */
  /* Check-in                                                         */
  /* ---------------------------------------------------------------- */

  /** The token a venue display should be showing. Coaches only. */
  checkInToken: coachProcedure.input(venueIdInput).query(async ({ input }) => {
    const venue = await prisma.venue.findFirst({
      where: { id: input.venueId, active: true },
      select: { id: true, checkInSecret: true },
    });
    if (!venue) throw new TRPCError({ code: "NOT_FOUND" });
    // The secret produces a token here and does not leave this resolver.
    return { token: currentToken(venue.id, venue.checkInSecret) };
  }),

  /** Scan the display. */
  checkInScan: ownerProcedure.input(checkInScanInput).mutation(async ({ ctx, input }) => {
    // The id inside a scanned token is a claim, not a fact — it is used only to
    // fetch a candidate secret, and nothing is trusted until the mac verifies.
    const claimedVenueId = input.token.split(":")[1] ?? "";
    const venue = await prisma.venue.findFirst({
      where: { id: claimedVenueId, active: true },
      select: { id: true, name: true, checkInSecret: true },
    });
    const verified = venue
      ? verifyCheckInToken(input.token, (id) => (id === venue.id ? venue.checkInSecret : null))
      : null;
    if (!venue || !verified) {
      // One message for "expired", "wrong venue" and "invented", because
      // telling those apart is only useful to somebody guessing macs.
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "That code isn't valid any more. Ask for a fresh one.",
      });
    }
    return recordVisit(ctx.user.id, venue.id, venue.name, CheckInSource.QR);
  }),

  /**
   * No camera, no display: say where you are.
   *
   * Recorded as MANUAL rather than QR, and the two are never collapsed. A
   * self-declared visit is a different quality of evidence, and anyone who
   * later wants to build on check-ins needs to be able to tell them apart.
   */
  checkInManual: ownerProcedure.input(checkInManualInput).mutation(async ({ ctx, input }) => {
    const venue = await prisma.venue.findFirst({
      where: { id: input.venueId, active: true },
      select: { id: true, name: true },
    });
    if (!venue) throw new TRPCError({ code: "NOT_FOUND" });
    return recordVisit(ctx.user.id, venue.id, venue.name, CheckInSource.MANUAL);
  }),

  /** Visits and attended classes — the caller's own gym history. */
  timeline: ownerProcedure.input(gymTimelineInput).query(async ({ ctx, input }) => {
    const window = dayWindow(input.from, input.days, zoneOffsetMinutes(DEFAULT_TIMEZONE));
    const visits = await prisma.gymVisit.findMany({
      where: { userId: ctx.user.id, checkedInAt: window },
      orderBy: { checkedInAt: "desc" },
      take: 200,
      select: {
        id: true,
        checkedInAt: true,
        source: true,
        venue: { select: { name: true } },
        gymClass: { select: { title: true, durationMin: true } },
      },
    });
    return {
      visits: visits.map((v) => ({
        id: v.id,
        at: v.checkedInAt.toISOString(),
        venue: v.venue.name,
        // Null whenever the scan matched no booked class. They were still
        // there, and the screen names the venue rather than inventing a class.
        klass: v.gymClass?.title ?? null,
        durationMin: v.gymClass?.durationMin ?? null,
        source: v.source,
      })),
    };
  }),
});

/** Today, on the platform's own day boundary rather than the server's UTC one. */
function todayIn(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * Record a visit, attaching it to a booked class only if one genuinely fits.
 *
 * A scan with no matching booking is a real visit with a null class. It never
 * creates a booking and never sets `attendedAt` on one: attendance is about a
 * class you chose to be on, and inventing that would put a claim in someone's
 * record that they never made. `classForCheckIn` returns null freely, and this
 * is the caller that has to be comfortable with that.
 *
 * A second scan inside the dedupe window returns the first visit rather than
 * writing another — someone scanning twice because the beep was ambiguous has
 * not been to the gym twice, and their timeline should not say they have.
 */
async function recordVisit(
  userId: string,
  venueId: string,
  venueName: string,
  source: CheckInSource,
): Promise<{
  id: string;
  venue: string;
  /** When the visit was recorded — the ORIGINAL time when this is a duplicate. */
  at: string;
  matchedClass: string | null;
  alreadyCheckedIn: boolean;
}> {
  const now = new Date();
  const since = new Date(now.getTime() - CHECKIN_DEDUPE_MINUTES * 60_000);

  const recent = await prisma.gymVisit.findFirst({
    where: { userId, venueId, checkedInAt: { gte: since } },
    orderBy: { checkedInAt: "desc" },
    select: { id: true, checkedInAt: true, gymClass: { select: { title: true } } },
  });
  if (recent) {
    // The earlier visit's own time, not now: "your 06:54 check-in still stands"
    // is only true if it reports 06:54.
    return {
      id: recent.id,
      venue: venueName,
      at: recent.checkedInAt.toISOString(),
      matchedClass: recent.gymClass?.title ?? null,
      alreadyCheckedIn: true,
    };
  }

  // Only classes this person had ALREADY booked are candidates. Nothing here
  // consults the schedule at large, because being in the building while a class
  // runs is not attending it.
  const booked = await prisma.classBooking.findMany({
    where: {
      userId,
      status: BookingStatus.BOOKED,
      gymClass: { venueId, status: ClassStatus.SCHEDULED },
    },
    select: { gymClass: { select: { id: true, title: true, startsAt: true, durationMin: true } } },
  });
  const match = classForCheckIn(
    booked.map((b) => b.gymClass),
    now,
  );

  const visit = await prisma.$transaction(async (tx) => {
    const created = await tx.gymVisit.create({
      data: { userId, venueId, classId: match?.id ?? null, source, checkedInAt: now },
      select: { id: true },
    });
    if (match) {
      // The one and only transition that produces ATTENDED, guarded on the
      // booking still being BOOKED so it cannot overwrite a cancellation.
      await tx.classBooking.updateMany({
        where: { classId: match.id, userId, status: BookingStatus.BOOKED },
        data: { status: BookingStatus.ATTENDED, attendedAt: now },
      });
    }
    return created;
  });

  await recordAudit({
    actorId: userId,
    action: AUDIT.gymCheckedIn,
    entity: "gymVisit",
    entityId: visit.id,
    meta: { source, matched: match !== null },
  });

  return {
    id: visit.id,
    venue: venueName,
    at: now.toISOString(),
    matchedClass: match?.title ?? null,
    alreadyCheckedIn: false,
  };
}
