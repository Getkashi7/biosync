/**
 * Data layer for the client's view of their coaching — the plans and notes a
 * trainer has shared with them. Read-only from the client's side; unshared notes
 * never reach this endpoint.
 */
import { trpc } from "../../lib/trpc";

export type TrainerFeed = Awaited<ReturnType<typeof trpc.training.mine.query>>;
export type SharedPlan = TrainerFeed["plans"][number];
export type SharedNote = TrainerFeed["notes"][number];

/** Everything a trainer has shared with the caller, in one round-trip. */
export async function fetchTrainerFeed(): Promise<TrainerFeed> {
  return trpc.training.mine.query();
}
