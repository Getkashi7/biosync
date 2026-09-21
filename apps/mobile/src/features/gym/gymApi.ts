/**
 * Data layer for §6 — classes, bookings, coaches and check-in.
 *
 * Types come from the tRPC router, never `@pulse/shared` (CLAUDE.md): mobile
 * has no path to it, and the router's types are generated from the same Zod
 * schemas so they cannot drift.
 *
 * Nothing here decides anything. `state` on a class, `payments` on a coach and
 * `payoutNote` all arrive computed — the rules about what a class currently is
 * and whether a coach can be paid live in one place on the server, and a screen
 * that re-derived them locally would be a second, slightly different answer.
 */
import { trpc } from "../../lib/trpc";
import { daysAgo, localDay } from "../../lib/gymFormat";

export type Schedule = Awaited<ReturnType<typeof trpc.gym.schedule.query>>;
export type GymClass = Schedule["classes"][number];
export type ClassState = GymClass["state"];

export type CoachList = Awaited<ReturnType<typeof trpc.gym.coaches.query>>;
export type Coach = CoachList["coaches"][number];

export type VenueList = Awaited<ReturnType<typeof trpc.gym.venues.query>>;
export type Venue = VenueList["venues"][number];

export type MyBookings = Awaited<ReturnType<typeof trpc.gym.myBookings.query>>;
export type Booking = MyBookings["bookings"][number];

export type Timeline = Awaited<ReturnType<typeof trpc.gym.timeline.query>>;
export type Visit = Timeline["visits"][number];

export type CheckInResult = Awaited<ReturnType<typeof trpc.gym.checkInManual.mutate>>;

export type MyClasses = Awaited<ReturnType<typeof trpc.gym.myClasses.query>>;
export type MyClass = MyClasses["classes"][number];
export type Roster = Awaited<ReturnType<typeof trpc.gym.roster.query>>;
export type MyCoachProfile = Awaited<ReturnType<typeof trpc.gym.myCoachProfile.query>>["profile"];

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

export async function fetchVenues(): Promise<Venue[]> {
  const res = await trpc.gym.venues.query();
  return res.venues;
}

/** The schedule for a window. `venueId` narrows it, and sets the day boundary. */
export async function fetchSchedule(
  from: string = localDay(),
  days = 7,
  venueId?: string,
): Promise<GymClass[]> {
  const res = await trpc.gym.schedule.query(venueId ? { from, days, venueId } : { from, days });
  return res.classes;
}

export async function fetchCoaches(specialty?: string, cursor?: string): Promise<CoachList> {
  return trpc.gym.coaches.query({
    ...(specialty ? { specialty: specialty as never } : {}),
    ...(cursor ? { cursor } : {}),
  });
}

export async function fetchMyBookings(): Promise<Booking[]> {
  const res = await trpc.gym.myBookings.query();
  return res.bookings;
}

/**
 * Visits, for the gym history. Thirty days back by default, **including today**.
 *
 * The window is `[from, from + days)`, so `from` is `days - 1` back, not
 * `days`. Asking from `daysAgo(30)` for 30 days ends the window at midnight
 * *this morning* — which silently hid every check-in made today, the ones a
 * person is most likely to be looking for. Caught on device on 2026-09-20:
 * checked in at 23:17, and the screen said "no check-ins in the last 30 days".
 */
export async function fetchGymTimeline(days = 30): Promise<Visit[]> {
  const from = daysAgo(days - 1);
  const res = await trpc.gym.timeline.query({ from, days });
  return res.visits;
}

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

export async function bookClass(classId: string): Promise<void> {
  await trpc.gym.book.mutate({ classId });
}

export async function cancelBooking(classId: string): Promise<void> {
  await trpc.gym.cancelBooking.mutate({ classId });
}

/**
 * Check in by naming the venue.
 *
 * `alreadyCheckedIn` comes back true when a visit inside the dedupe window
 * already existed — the screen says "you're already checked in" rather than
 * claiming a second visit that did not happen.
 */
export async function checkInManual(venueId: string): Promise<CheckInResult> {
  return trpc.gym.checkInManual.mutate({ venueId });
}

/* ------------------------------------------------------------------ */
/* Coach side                                                         */
/* ------------------------------------------------------------------ */

export async function fetchMyCoachProfile(): Promise<MyCoachProfile> {
  const res = await trpc.gym.myCoachProfile.query();
  return res.profile;
}

export async function saveCoachProfile(input: {
  displayName: string;
  bio?: string;
  specialties: string[];
  bookingUrl?: string | null;
}): Promise<void> {
  await trpc.gym.saveCoachProfile.mutate(input as never);
}

export async function setListed(listed: boolean): Promise<void> {
  await trpc.gym.setListed.mutate({ listed });
}

export async function createClass(input: {
  venueId: string;
  title: string;
  description?: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
}): Promise<void> {
  await trpc.gym.createClass.mutate(input);
}

export async function cancelClass(id: string, reason: string): Promise<number> {
  const res = await trpc.gym.cancelClass.mutate({ id, reason });
  return res.bookingsCancelled;
}

export async function fetchRoster(classId: string): Promise<Roster> {
  return trpc.gym.roster.query({ classId });
}

/**
 * The caller's own classes — the coach read, not the member one.
 *
 * Starts from today by default: the question a coach opens this to answer is
 * "what am I teaching next", not "what did I teach in March".
 */
export async function fetchMyClasses(days = 14): Promise<MyClass[]> {
  const res = await trpc.gym.myClasses.query({ days });
  return res.classes;
}
