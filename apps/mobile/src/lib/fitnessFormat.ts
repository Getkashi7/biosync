/**
 * Presentation helpers for §3 fitness plans.
 *
 * Mobile cannot import `@pulse/shared` (CLAUDE.md), so the few lines of pure
 * logic the screen needs live here and are covered by a mobile test — the same
 * arrangement as `photoFormat.ts` and `treatmentCopy.ts`. Nothing here decides
 * training load; that is `buildWeek` on the server. These only format what it
 * already decided.
 */

export type SetsReps = { sets: number; reps: number; hold: boolean };

/**
 * "3 × 10" for reps, "3 × 40s" for a hold, "20m" for anything long enough that
 * seconds stop being readable.
 *
 * The distinction matters: "1 × 1200" for a twenty-minute walk is technically
 * the stored value and completely useless to read mid-session.
 */
export function formatSetsReps(x: SetsReps): string {
  if (!x.hold) return `${x.sets} × ${x.reps}`;
  const per = x.reps >= 120 ? `${Math.round(x.reps / 60)}m` : `${x.reps}s`;
  return x.sets === 1 ? per : `${x.sets} × ${per}`;
}

/** Monday-first single letter for the week spine. */
export function dayLetter(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  return ["S", "M", "T", "W", "T", "F", "S"][d.getUTCDay()] ?? "";
}

export type SpineDay = {
  date: string;
  label: string;
  intensity: number;
  rest: boolean;
  completed: boolean;
};

/**
 * The week reduced to what the spine draws.
 *
 * Deliberately does not invent missing days: if the server returned five
 * sessions, five dots are drawn. A spine that always shows seven would imply a
 * plan exists for days that have none.
 */
export function weekDots(
  sessions: { date: string; intensity: number; rest: boolean; completed: boolean }[],
): SpineDay[] {
  return sessions.map((s) => ({
    date: s.date,
    label: dayLetter(s.date),
    intensity: s.intensity,
    rest: s.rest,
    completed: s.completed,
  }));
}
