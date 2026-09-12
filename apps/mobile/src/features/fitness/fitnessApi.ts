/**
 * Data layer for §3 fitness plans.
 *
 * Types come from the tRPC router, not `@pulse/shared` — mobile has no path to
 * it (CLAUDE.md). The week arrives already built; nothing here decides what the
 * user should train, and nothing should start.
 */
import { trpc } from "../../lib/trpc";
import { todayLocal } from "../checkin/checkinApi";

export type Week = Awaited<ReturnType<typeof trpc.fitness.week.query>>;
export type Session = Week["sessions"][number];
export type PlannedExercise = Session["items"][number];
export type SessionFeedback = NonNullable<Session["feedback"]>;

/**
 * This week's plan, generating any missing days server-side.
 *
 * `planned: false` means the user has no goal yet — a different thing from an
 * empty week, and the screen has to say so rather than showing seven blanks.
 */
export async function fetchWeek(date: string = todayLocal()): Promise<Week> {
  return trpc.fitness.week.query({ date });
}

/** Tick one exercise off, or back on. Returns the session's new item list. */
export async function toggleExercise(
  date: string,
  slug: string,
  done: boolean,
): Promise<PlannedExercise[]> {
  const res = await trpc.fitness.toggleExercise.mutate({ date, slug, done });
  return res.items;
}

/**
 * Finish a session and rate it.
 *
 * The rating shapes the NEXT week, not this one — the server deliberately does
 * not rewrite a plan the user is partway through.
 */
export async function completeSession(date: string, feedback: SessionFeedback): Promise<void> {
  await trpc.fitness.complete.mutate({ date, feedback });
}

/** Rebuild the untouched days of this week against today's readiness. */
export async function regenerateWeek(date: string = todayLocal()): Promise<number> {
  const res = await trpc.fitness.regenerate.mutate({ date });
  return res.rebuilt;
}
