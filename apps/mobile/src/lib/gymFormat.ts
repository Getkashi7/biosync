/**
 * Display helpers for §6 — class times, day headings, and the reason a class
 * cannot be booked.
 *
 * Mirrors the day arithmetic in `packages/shared/src/fitness.ts` (`addDays`) and
 * the class states produced by `packages/shared/src/gym.ts` (`classState`).
 * Duplicated rather than imported because mobile has no path to `@pulse/shared`
 * at all — the same established pattern as `format.ts`, `photoFormat.ts` and
 * `fitnessFormat.ts`, each of which says so in its own header.
 *
 * What is NOT mirrored here, on purpose: whether a class is full, cancelled or
 * under way. That is `state` on the row, computed by the server. A screen that
 * worked it out again from `seatsTaken` and the clock would be a second answer
 * that disagrees with the one the Book button is actually checked against.
 *
 * Hand-rolled rather than `Intl`, like `format.ts`: Hermes on Android ships a
 * trimmed ICU and cannot be relied on for consistent output across devices.
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** The states `gym.schedule` can report for a class. */
export type ClassState = "OPEN" | "FULL" | "CANCELLED" | "IN_PROGRESS" | "PAST";

/** `YYYY-MM-DD` for a date in the device's own zone. */
export function localDay(at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD`, `n` days before the given day. Mirrors shared's `addDays`. */
export function daysAgo(n: number, today: string = localDay()): string {
  const parts = today.split("-").map(Number);
  const at = new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1));
  at.setUTCDate(at.getUTCDate() - n);
  return at.toISOString().slice(0, 10);
}

/**
 * "Fri 25 Sep" from a `YYYY-MM-DD`, for a form that has picked a day.
 *
 * Built through the local Date constructor rather than `new Date(ymd)`, which
 * parses a bare date as UTC midnight and therefore shows the previous day to
 * anyone west of Greenwich.
 */
export function ymdLabel(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  const [y, m, d] = parts;
  if (parts.length !== 3 || !y || !m || !d) return ymd;
  const at = new Date(y, m - 1, d);
  if (Number.isNaN(at.getTime()) || at.getMonth() !== m - 1) return ymd;
  return `${DAY_NAMES[at.getDay()]} ${at.getDate()} ${MONTH_NAMES[at.getMonth()]}`;
}

/** "18:00", in the device's zone. A class at 18:00 is 18:00 in the room. */
export function classTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "18:00 – 18:45", from a start and a duration. */
export function classRange(iso: string, durationMin: number): string {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + durationMin * 60_000);
  return `${classTime(iso)} – ${classTime(end.toISOString())}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Today", "Tomorrow", or "Thu 18 Sep" — the heading above a day's classes. */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/**
 * Why a class cannot be booked, in words, or null when it can be.
 *
 * Shown on the card BEFORE anyone taps, so a missing Book button is explained
 * rather than mysterious. "Full" and "Under way" are kept apart deliberately:
 * one might free up if somebody cancels, the other never will.
 */
export function unbookableReason(state: ClassState): string | null {
  switch (state) {
    case "OPEN":
      return null;
    case "FULL":
      return "Full";
    case "CANCELLED":
      return "Cancelled";
    case "IN_PROGRESS":
      return "Under way";
    case "PAST":
      return "Finished";
    default:
      // An unknown state from a newer server. Saying nothing is wrong, and
      // guessing "Open" would offer a button that fails — so it reads as
      // unavailable without claiming to know why.
      return "Unavailable";
  }
}

/**
 * "3 left", "Full", or null when the number would be noise.
 *
 * Silent above the threshold on purpose: "17 left" on a 20-person class is not
 * information anybody acts on, and printing it everywhere turns the one case
 * that matters — nearly full — into background text.
 */
export const SEATS_URGENT = 5;

export function seatsLabel(seatsLeft: number): string | null {
  if (seatsLeft <= 0) return "Full";
  if (seatsLeft <= SEATS_URGENT) return `${seatsLeft} left`;
  return null;
}

/**
 * Group an ordered schedule into days.
 *
 * Preserves the server's ordering rather than sorting again — the query already
 * ordered by `startsAt`, and re-sorting here would quietly diverge the moment
 * the server's ordering changes.
 */
export function groupByDay<T extends { startsAt: string }>(
  rows: readonly T[],
  now: Date = new Date(),
): Array<{ heading: string; rows: T[] }> {
  const out: Array<{ heading: string; rows: T[] }> = [];
  for (const row of rows) {
    const heading = dayHeading(row.startsAt, now);
    const last = out[out.length - 1];
    if (last && last.heading === heading) last.rows.push(row);
    else out.push({ heading, rows: [row] });
  }
  return out;
}
