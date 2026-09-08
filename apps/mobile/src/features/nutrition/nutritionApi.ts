/**
 * Data layer for Nutrition. Kept apart from the screens so they stay
 * presentation-only. `estimate` never writes — it returns the coach's numbers for
 * the user to confirm or adjust, and only `logMeal` persists them.
 */
import { trpc } from "../../lib/trpc";
import { todayLocal } from "../checkin/checkinApi";

export type NutritionDay = Awaited<ReturnType<typeof trpc.nutrition.day.query>>;
export type Meal = NutritionDay["meals"][number];
/** the derived, non-generated coach read that comes back with the day */
export type NutritionRead = NonNullable<NutritionDay["read"]>;
export type MacroEstimate = NonNullable<
  Awaited<ReturnType<typeof trpc.nutrition.estimate.mutate>>["estimate"]
>;

/** Today's meals plus totals, targets and ring progress. */
export async function fetchDay(): Promise<NutritionDay> {
  return trpc.nutrition.day.query({ date: todayLocal() });
}

/**
 * Ask the coach to estimate macros from a plain-language meal. Resolves with
 * null when the coach is off or returned something untrustworthy — the caller
 * then lets the user type the numbers instead.
 */
/**
 * Why an estimate didn't come back, so the sheet can say something true.
 *
 * The API already distinguishes these; the client used to discard the
 * distinction and show "couldn't reach the coach" for all of them — which sent
 * people to check their connection over a rejected API key.
 */
export type EstimateOutcome =
  | { estimate: MacroEstimate }
  | { estimate: null; reason: "off" | "busy" | "unreachable" | "unusable" };

export async function estimateMeal(description: string): Promise<EstimateOutcome> {
  const res = await trpc.nutrition.estimate.mutate({ description });
  if (res.estimate) return { estimate: res.estimate };

  // `configured: false` means no key at all; a rejected one is equally ours to
  // fix and equally permanent, so both read as "off" to the user.
  const reason =
    res.reason === "unconfigured" || res.reason === "rejected" || !res.configured
      ? "off"
      : res.reason === "rate_limited"
        ? "busy"
        : res.reason === "unusable"
          ? "unusable"
          : "unreachable";
  return { estimate: null, reason };
}

export type NewMeal = {
  description: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
  /** false once the user has edited the coach's numbers */
  estimated: boolean;
};

/** Persist a meal against today. */
export async function logMeal(meal: NewMeal): Promise<void> {
  await trpc.nutrition.log.mutate({ ...meal, date: todayLocal() });
}

/** Delete one of the user's meals. */
export async function removeMeal(id: string): Promise<void> {
  await trpc.nutrition.remove.mutate({ id });
}
