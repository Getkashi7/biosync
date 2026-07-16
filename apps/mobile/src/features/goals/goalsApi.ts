/**
 * Data layer for Goals. Kept apart from the UI so the sheet and dashboard
 * section stay presentation-only.
 */
import { trpc } from "../../lib/trpc";

export type Goal = Awaited<ReturnType<typeof trpc.goals.list.query>>[number];
export type NewGoal = Parameters<typeof trpc.goals.set.mutate>[0];

export async function fetchGoals(): Promise<Goal[]> {
  return trpc.goals.list.query();
}

export async function createGoal(input: NewGoal): Promise<void> {
  await trpc.goals.set.mutate(input);
}
