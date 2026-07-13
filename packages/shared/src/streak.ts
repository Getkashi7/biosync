/**
 * Check-in streak: consecutive calendar days ending at (or the day before)
 * "today". Operates purely on YYYY-MM-DD strings, so it's timezone-safe as long
 * as both the stored dates and `today` are computed in the user's device
 * timezone. Date math uses UTC noon internally to sidestep DST.
 */

/** The calendar day before `date` (YYYY-MM-DD), independent of local timezone. */
export function prevDay(date: string): string {
  const parts = date.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const ms = Date.UTC(y, m - 1, d) - 86_400_000;
  const dt = new Date(ms);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Current streak given the set of dates a user has checked in, plus their local
 * "today". Counts today if logged; otherwise starts from yesterday (a one-day
 * grace so a not-yet-logged today doesn't zero an active streak). A gap resets
 * it to 0.
 */
export function computeStreak(dates: Iterable<string>, today: string): number {
  const set = dates instanceof Set ? dates : new Set(dates);

  let cursor = today;
  if (!set.has(cursor)) {
    cursor = prevDay(cursor);
    if (!set.has(cursor)) return 0;
  }

  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = prevDay(cursor);
  }
  return streak;
}
