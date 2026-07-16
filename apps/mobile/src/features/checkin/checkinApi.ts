/**
 * Data layer for the Daily Check-in. Kept apart from the sheet UI so the sheet
 * stays presentation-only and testable. `submitCheckin` upserts today's row via
 * `logs.checkin` and returns the streak from `logs.streak`.
 */
import { trpc } from "../../lib/trpc";

export type CheckinInput = {
  /** device-local calendar date, YYYY-MM-DD */
  date: string;
  /** 0–12, 0.5h steps */
  sleepHours: number;
  /** 1–5 */
  sleepQuality: number;
  /** 1–5 */
  energy: number;
  /** 1–5 */
  mood: number;
  /** kilograms, or null when the optional weight is left blank */
  weightKg: number | null;
};

/** Device-local calendar date (YYYY-MM-DD) — uses local getters so it's tz-correct. */
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Persist today's check-in and return the resulting streak, or null when the
 * streak lookup fails. The check-in is saved by then — a streak hiccup must
 * never turn a successful save into an error state.
 */
export async function submitCheckin(input: CheckinInput): Promise<number | null> {
  await trpc.logs.checkin.mutate(input);
  try {
    const { streak } = await trpc.logs.streak.query({ today: input.date });
    return streak;
  } catch {
    return null;
  }
}
