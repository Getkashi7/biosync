/**
 * Classes, bookings and check-ins (§6).
 *
 * Two things here are load-bearing.
 *
 * **The booking transition table is data**, like §7's, so the whole lifecycle
 * can be read at once and asserted exhaustively. Note what is absent and must
 * stay absent: no actor can write `ATTENDED`. Attendance is a fact about a body
 * being in a room, produced by a check-in or not at all — the same shape as
 * "nothing reaches APPROVED except a practitioner deciding".
 *
 * **Crypto stays out**, one step further than `invites.ts`. That module takes a
 * randomness callback; this one never even compares. `expectedCheckInPayloads`
 * returns the payload strings currently acceptable, and the API HMACs each with
 * the venue secret and compares in constant time. Shared holds no key, no hash
 * and no equality test.
 *
 * Dates: the *window* a client asks for is `YYYY-MM-DD` and reuses `addDays`
 * from `fitness.ts`. A class's own time is an instant, because a class at 18:00
 * is 18:00 in the room — see the `GymClass` model comment.
 */
import { z } from "zod";
import { addDays } from "./fitness";

/* ------------------------------------------------------------------ */
/* Bounds                                                             */
/* ------------------------------------------------------------------ */

/** Rotating check-in token: one window per minute. */
export const CHECKIN_WINDOW_SECONDS = 60;
/**
 * Windows either side that are still accepted.
 *
 * One, not more. A phone clock a few seconds out must still work; a token
 * accepted for ten minutes is a screenshot someone can use from the car park.
 */
export const CHECKIN_WINDOW_SKEW = 1;
/** How early a check-in can count towards a booked class. */
export const CHECKIN_EARLY_MINUTES = 30;
/** How late, measured from the class start. */
export const CHECKIN_LATE_MINUTES = 15;
/**
 * A second scan inside this window is the same visit.
 *
 * Someone scanning twice because the first beep was ambiguous has not visited
 * twice, and their timeline should not say they did.
 */
export const CHECKIN_DEDUPE_MINUTES = 90;
/** The longest schedule a client may ask for in one call. */
export const MAX_SCHEDULE_DAYS = 14;
/** Rooms have limits; so does a number someone can type into a form. */
export const MAX_CLASS_CAPACITY = 200;
export const CHECKIN_TOKEN_PREFIX = "BIOSYNC1";

/* ------------------------------------------------------------------ */
/* Enums, mirroring Prisma                                            */
/* ------------------------------------------------------------------ */

export const classStatus = z.enum(["SCHEDULED", "CANCELLED"]);
export const bookingStatus = z.enum(["BOOKED", "CANCELLED", "ATTENDED", "NO_SHOW"]);
export const checkInSource = z.enum(["QR", "MANUAL", "STAFF"]);

export type ClassStatus = z.infer<typeof classStatus>;
export type BookingStatus = z.infer<typeof bookingStatus>;
export type CheckInSource = z.infer<typeof checkInSource>;

/* ------------------------------------------------------------------ */
/* The booking lifecycle                                              */
/* ------------------------------------------------------------------ */

export type BookingActor = "MEMBER" | "STAFF" | "SYSTEM";

/**
 * Every transition that may exist. Anything absent is refused.
 *
 * `BOOKED → ATTENDED` belongs to SYSTEM alone, and SYSTEM appears nowhere else:
 * a check-in produces attendance, and no member or staff member can assert it.
 */
const BOOKING_TRANSITIONS: ReadonlyArray<{
  from: BookingStatus;
  to: BookingStatus;
  actor: BookingActor;
}> = [
  { from: "BOOKED", to: "CANCELLED", actor: "MEMBER" },
  // Staff cancel a whole class, or remove someone from a roster.
  { from: "BOOKED", to: "CANCELLED", actor: "STAFF" },
  { from: "BOOKED", to: "ATTENDED", actor: "SYSTEM" },
  { from: "BOOKED", to: "NO_SHOW", actor: "STAFF" },
  // Changed their mind back, subject to the class still having room.
  { from: "CANCELLED", to: "BOOKED", actor: "MEMBER" },
];

export function canTransitionBooking(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingActor,
): boolean {
  return BOOKING_TRANSITIONS.some((t) => t.from === from && t.to === to && t.actor === actor);
}

/* ------------------------------------------------------------------ */
/* Derived class state                                                */
/* ------------------------------------------------------------------ */

export type ClassView = {
  status: ClassStatus;
  startsAt: Date;
  durationMin: number;
  capacity: number;
  seatsTaken: number;
};

export type ClassState = "CANCELLED" | "PAST" | "IN_PROGRESS" | "FULL" | "OPEN";

/** Seats left, never negative even if the counter drifted. */
export function seatsLeft(c: Pick<ClassView, "capacity" | "seatsTaken">): number {
  return Math.max(0, c.capacity - c.seatsTaken);
}

/**
 * What a class currently is, from the clock and the counter.
 *
 * Order matters: cancelled beats everything, and a class already under way is
 * not "full" even if it is — the reason you cannot book it is that it started.
 */
export function classState(c: ClassView, now: Date = new Date()): ClassState {
  if (c.status === "CANCELLED") return "CANCELLED";
  const endsAt = c.startsAt.getTime() + c.durationMin * 60_000;
  if (now.getTime() >= endsAt) return "PAST";
  if (now.getTime() >= c.startsAt.getTime()) return "IN_PROGRESS";
  if (seatsLeft(c) === 0) return "FULL";
  return "OPEN";
}

export function canBook(c: ClassView, now: Date = new Date()): boolean {
  return classState(c, now) === "OPEN";
}

/** A member may cancel until it starts; after that they simply did not attend. */
export function canCancelBooking(c: ClassView, now: Date = new Date()): boolean {
  return c.status !== "CANCELLED" && now.getTime() < c.startsAt.getTime();
}

/* ------------------------------------------------------------------ */
/* Check-in                                                           */
/* ------------------------------------------------------------------ */

/** Which minute-window an instant falls in. */
export function checkInWindow(nowSeconds: number): number {
  return Math.floor(nowSeconds / CHECKIN_WINDOW_SECONDS);
}

/**
 * The payloads a scan may legitimately carry right now.
 *
 * The API signs each of these with the venue's secret and compares the result
 * against what was scanned — so shared decides *what is in date* and never
 * touches the key.
 */
export function expectedCheckInPayloads(venueId: string, nowSeconds: number): string[] {
  const w = checkInWindow(nowSeconds);
  const out: string[] = [];
  for (let d = -CHECKIN_WINDOW_SKEW; d <= CHECKIN_WINDOW_SKEW; d++) {
    out.push(`${venueId}:${w + d}`);
  }
  return out;
}

export type CheckInToken = { venueId: string; window: number; mac: string };

/**
 * Parse a scanned string, or null if it is not one of ours.
 *
 * Shape only — whether the mac is *correct* is the API's job, because that
 * needs the key.
 */
export function parseCheckInToken(raw: string): CheckInToken | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const parts = raw.split(":");
  if (parts.length !== 4) return null;
  const [prefix, venueId, windowRaw, mac] = parts as [string, string, string, string];
  if (prefix !== CHECKIN_TOKEN_PREFIX) return null;
  if (venueId.length === 0 || venueId.length > 64) return null;
  if (mac.length === 0 || mac.length > 64) return null;
  const window = Number(windowRaw);
  if (!Number.isInteger(window) || window <= 0) return null;
  return { venueId, window, mac };
}

/** Assemble a token. `sign` is injected — no crypto in this module. */
export function buildCheckInToken(
  venueId: string,
  window: number,
  sign: (payload: string) => string,
): string {
  return `${CHECKIN_TOKEN_PREFIX}:${venueId}:${window}:${sign(`${venueId}:${window}`)}`;
}

/**
 * Which booked class a check-in should count towards, if any.
 *
 * Returns null freely. A scan with no matching booking is still a real visit —
 * the person was there — and must never invent a booking to attach itself to.
 */
export function classForCheckIn<T extends { id: string; startsAt: Date; durationMin: number }>(
  booked: readonly T[],
  now: Date = new Date(),
): T | null {
  const t = now.getTime();
  const candidates = booked.filter((c) => {
    const opens = c.startsAt.getTime() - CHECKIN_EARLY_MINUTES * 60_000;
    const closes = c.startsAt.getTime() + CHECKIN_LATE_MINUTES * 60_000;
    return t >= opens && t <= closes;
  });
  if (candidates.length === 0) return null;
  // Nearest start wins, so back-to-back classes resolve predictably.
  return candidates.reduce((best, c) =>
    Math.abs(c.startsAt.getTime() - t) < Math.abs(best.startsAt.getTime() - t) ? c : best,
  );
}

/* ------------------------------------------------------------------ */
/* Schedule window                                                    */
/* ------------------------------------------------------------------ */

/**
 * A `YYYY-MM-DD` day span as an instant range.
 *
 * The venue's UTC offset is passed in rather than computed: shared never
 * touches `Intl`, the same way it never touches crypto. The API derives the
 * offset from `Venue.timezone`.
 */
export function dayWindow(
  from: string,
  days: number,
  offsetMinutes = 0,
): { gte: Date; lt: Date } {
  const span = Math.max(1, Math.min(MAX_SCHEDULE_DAYS, days));
  const startUtc = new Date(`${from}T00:00:00.000Z`).getTime();
  const endUtc = new Date(`${addDays(from, span)}T00:00:00.000Z`).getTime();
  const shift = offsetMinutes * 60_000;
  return { gte: new Date(startUtc - shift), lt: new Date(endUtc - shift) };
}

/* ------------------------------------------------------------------ */
/* Inputs                                                             */
/* ------------------------------------------------------------------ */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const venueInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200).nullish(),
  timezone: z.string().trim().min(1).max(64).default("Europe/London"),
  active: z.boolean().default(true),
});

export const classCreateInput = z.object({
  venueId: z.string().uuid(),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullish(),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(5).max(300),
  capacity: z.number().int().min(1).max(MAX_CLASS_CAPACITY),
});

export const classUpdateInput = classCreateInput.partial().extend({ id: z.string().uuid() });

export const classCancelInput = z.object({
  id: z.string().uuid(),
  // A cancellation with no reason is a notification, not an explanation.
  reason: z.string().trim().min(5).max(300),
});

export const scheduleInput = z.object({
  venueId: z.string().uuid().optional(),
  from: ymd,
  days: z.number().int().min(1).max(MAX_SCHEDULE_DAYS).default(7),
});

export const classIdInput = z.object({ classId: z.string().uuid() });

/**
 * A coach's own classes.
 *
 * `from` is optional: with nothing given the server starts from today, because
 * the question a coach opens this to answer is "what am I teaching next", not
 * "what did I teach in March".
 */
export const myClassesInput = z.object({
  from: ymd.optional(),
  days: z.number().int().min(1).max(MAX_SCHEDULE_DAYS).default(14),
});

export const checkInScanInput = z.object({ token: z.string().min(1).max(200) });
export const checkInManualInput = z.object({ venueId: z.string().uuid() });
export const venueIdInput = z.object({ venueId: z.string().uuid() });

export const gymTimelineInput = z.object({
  from: ymd,
  days: z.number().int().min(1).max(60).default(30),
});

export type ScheduleInput = z.infer<typeof scheduleInput>;
export type ClassCreateInput = z.infer<typeof classCreateInput>;
