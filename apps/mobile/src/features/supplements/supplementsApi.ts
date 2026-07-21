/**
 * Data layer for Supplements. Kept apart from the screens so they stay
 * presentation-only. The stack is entirely user-entered — `suggest` only ever
 * returns informational reading, never something that gets written for them.
 */
import { trpc } from "../../lib/trpc";
import { todayLocal } from "../checkin/checkinApi";

export type SupplementDay = Awaited<ReturnType<typeof trpc.supplements.day.query>>;
export type StackItem = SupplementDay["stack"][number];
export type ScheduleSlot = SupplementDay["slots"][number];
export type ScheduledDose = ScheduleSlot["doses"][number];
export type Timing = ScheduledDose["timing"];
export type Suggestion = NonNullable<
  Awaited<ReturnType<typeof trpc.supplements.suggest.mutate>>["suggestions"]
>[number];

/** The stack plus today's AM/PRE/PM strip and adherence. */
export async function fetchDay(): Promise<SupplementDay> {
  return trpc.supplements.day.query({ date: todayLocal() });
}

export type NewSupplement = {
  name: string;
  dose: string;
  timings: Timing[];
  note?: string | null;
};

/** Add something the user already takes. */
export async function addSupplement(entry: NewSupplement): Promise<void> {
  await trpc.supplements.add.mutate(entry);
}

/** Remove an entry from the stack. */
export async function removeSupplement(id: string): Promise<void> {
  await trpc.supplements.remove.mutate({ id });
}

/** Tick or untick one dose for today. Idempotent server-side. */
export async function setTaken(id: string, timing: Timing, taken: boolean): Promise<void> {
  await trpc.supplements.setTaken.mutate({ id, timing, taken, date: todayLocal() });
}

/**
 * Informational suggestions. Null when the coach is off or nothing survived the
 * server's safety filter — the screen then shows its "nothing to show" state.
 */
export async function fetchSuggestions(): Promise<Suggestion[] | null> {
  const res = await trpc.supplements.suggest.mutate({});
  return res.suggestions;
}
