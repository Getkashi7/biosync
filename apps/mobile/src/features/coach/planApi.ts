/**
 * Data layer for the Coach plan. Kept apart from the sheet so the UI stays
 * presentation-only. One call asks the coach to build a short, non-diagnostic
 * plan for today, biased by `focus`, grounded server-side in the user's data.
 */
import { trpc } from "../../lib/trpc";

export type PlanResult = Awaited<ReturnType<typeof trpc.assistant.plan.mutate>>;
export type Plan = PlanResult["plan"];
export type PlanFocus = "training" | "recovery" | "balanced";

/** Generate today's plan; the server always resolves with a (possibly placeholder) plan. */
export async function generatePlan(focus: PlanFocus): Promise<PlanResult> {
  return trpc.assistant.plan.mutate({ focus });
}
