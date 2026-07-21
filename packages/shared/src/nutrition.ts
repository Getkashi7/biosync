/**
 * Nutrition — validation + the pure maths behind the macro rings.
 *
 * Two pure pieces live here so they're unit-testable without a database or a
 * network call: `macroTargets` (a person's daily targets, scaled to bodyweight
 * when we know it) and `summariseDay` (a day's meals → totals + ring progress).
 *
 * `parseMacroEstimate` validates what the LLM returns when it estimates a meal
 * from a plain-language description. It is deliberately lenient about shape
 * (numbers may arrive as strings) but strict about range, and returns null on
 * anything it can't trust — the caller then keeps the UI usable rather than
 * writing a junk number into the user's log.
 *
 * Nothing here is medical: targets are general wellness heuristics, not a
 * prescription, and the UI always says so.
 */
import { z } from "zod";
import { dateStringSchema } from "./checkin";

// ── Input schemas ────────────────────────────────────────────────────────────
export const nutritionDayInput = z.object({
  /** device-local day, so a day's totals bucket correctly across timezones */
  date: dateStringSchema,
});
export type NutritionDayInput = z.infer<typeof nutritionDayInput>;

export const mealInput = z.object({
  date: dateStringSchema,
  description: z.string().min(1).max(200),
  calories: z.number().int().min(0).max(10_000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
  fiberG: z.number().min(0).max(200).nullish(),
  /** false once the user has adjusted the AI's numbers */
  estimated: z.boolean().default(true),
});
export type MealInput = z.infer<typeof mealInput>;

export const mealRemoveInput = z.object({ id: z.string().uuid() });

export const estimateInput = z.object({
  /** plain-language meal, e.g. "2 eggs, toast and a black coffee" */
  description: z.string().min(1).max(300),
});
export type EstimateInput = z.infer<typeof estimateInput>;

// ── The LLM's macro estimate ─────────────────────────────────────────────────
export type MacroEstimate = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  /** the individual foods the model recognised, for the confirm card */
  items?: string[];
};

/** Lenient on type (models emit "12" as often as 12), strict on range. */
const rawEstimate = z.object({
  calories: z.coerce.number().min(0).max(10_000),
  proteinG: z.coerce.number().min(0).max(1000),
  carbsG: z.coerce.number().min(0).max(1000),
  fatG: z.coerce.number().min(0).max(1000),
  fiberG: z.coerce.number().min(0).max(200).optional(),
  items: z.array(z.string().min(1).max(80)).max(12).optional(),
});

const round1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * Parse the model's JSON macro estimate. Returns null when the payload isn't
 * valid JSON, doesn't match, or carries an out-of-range value — never throws.
 */
export function parseMacroEstimate(raw: string): MacroEstimate | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = rawEstimate.safeParse(json);
  if (!parsed.success) return null;
  const d = parsed.data;
  const estimate: MacroEstimate = {
    calories: Math.round(d.calories),
    proteinG: round1(d.proteinG),
    carbsG: round1(d.carbsG),
    fatG: round1(d.fatG),
  };
  if (d.fiberG !== undefined) estimate.fiberG = round1(d.fiberG);
  if (d.items && d.items.length > 0) estimate.items = d.items;
  return estimate;
}

// ── Targets ──────────────────────────────────────────────────────────────────
export type MacroTargets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
};

/** Used when we don't know the person's weight yet — general adult defaults. */
export const DEFAULT_TARGETS: MacroTargets = {
  calories: 2000,
  proteinG: 120,
  carbsG: 220,
  fatG: 65,
  fiberG: 30,
};

/** kcal per gram, for turning the protein/fat allowance into a carb remainder. */
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;

/** general-wellness heuristics, per kg of bodyweight */
const CAL_PER_KG = 30;
const PROTEIN_PER_KG = 1.6;
const FAT_PER_KG = 0.8;
/** fibre scales with intake (~14 g per 1000 kcal), with a sensible floor */
const FIBER_PER_1000_KCAL = 14;
const MIN_FIBER_G = 20;

/**
 * Bodyweights we're willing to scale targets from. Outside this range the number
 * is far more likely to be a mistake than a real adult weight — most commonly a
 * pounds value entered while the unit toggle said kg (65 lb → 29.5 kg), which
 * would otherwise produce a ~885 kcal daily target and have the app report
 * "over target" at a third of a normal day. When we can't trust the input we
 * fall back to the adult defaults rather than compute a target that could nudge
 * someone to under-eat.
 */
const MIN_PLAUSIBLE_KG = 35;
const MAX_PLAUSIBLE_KG = 250;

/**
 * Daily macro targets. Scaled to bodyweight when we have a plausible one
 * (protein and fat are set per-kg, carbohydrate takes the remaining energy);
 * otherwise the adult default. A general wellness heuristic — never a clinical
 * prescription.
 */
export function macroTargets(weightKg: number | null): MacroTargets {
  if (weightKg === null || !Number.isFinite(weightKg)) return DEFAULT_TARGETS;
  if (weightKg < MIN_PLAUSIBLE_KG || weightKg > MAX_PLAUSIBLE_KG) return DEFAULT_TARGETS;

  const calories = Math.round(CAL_PER_KG * weightKg);
  const proteinG = Math.round(PROTEIN_PER_KG * weightKg);
  const fatG = Math.round(FAT_PER_KG * weightKg);
  const remaining = calories - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT;
  const carbsG = Math.max(0, Math.round(remaining / KCAL_PER_G_CARB));
  const fiberG = Math.max(MIN_FIBER_G, Math.round((calories / 1000) * FIBER_PER_1000_KCAL));

  return { calories, proteinG, carbsG, fatG, fiberG };
}

// ── Day summary ──────────────────────────────────────────────────────────────
export type MealPoint = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
};

export type MacroTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
};

export type NutritionDay = {
  totals: MacroTotals;
  targets: MacroTargets;
  /**
   * Ratio of total to target per macro. Deliberately NOT clamped at 1 so the
   * ring can show an overshoot; the client clamps the arc if it wants to.
   */
  progress: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  /** target − consumed; negative once the user is over */
  remainingCalories: number;
  mealCount: number;
};

export type NutritionRead = {
  headline: string;
  detail: string;
  /** filled confidence dots, 1–4, from how many meals back the read */
  confidence: number;
};

/** protein below this share of target reads as "trailing" */
const PROTEIN_BEHIND = 0.7;
/** fibre below this share of target is worth a gentle nudge */
const FIBER_BEHIND = 0.6;
/** calories at/above this share of target reads as "past" */
const CALORIES_OVER = 1.05;

/**
 * A short, non-diagnostic read on the day, derived from the user's own totals —
 * no model involved, so it can't invent a number. Null on an empty day (the
 * screen shows its first-run state instead).
 */
export function nutritionRead(day: NutritionDay): NutritionRead | null {
  if (day.mealCount === 0) return null;
  const confidence = Math.max(1, Math.min(4, day.mealCount));
  const { progress, targets, totals, remainingCalories } = day;

  if (progress.calories >= CALORIES_OVER) {
    return {
      headline: "You're past today's calorie target.",
      detail: `About ${Math.abs(remainingCalories)} kcal over — worth an easy evening and an earlier finish.`,
      confidence,
    };
  }
  if (progress.protein < PROTEIN_BEHIND) {
    const gap = Math.max(0, Math.round(targets.proteinG - totals.proteinG));
    return {
      headline: "Protein is trailing today.",
      detail: `About ${gap} g to go — a protein-forward next meal usually closes the gap.`,
      confidence,
    };
  }
  if (progress.fiber < FIBER_BEHIND) {
    const gap = Math.max(0, Math.round(targets.fiberG - totals.fiberG));
    return {
      headline: "Fibre is running low today.",
      detail: `About ${gap} g short — fruit, beans or wholegrains are the easy win.`,
      confidence,
    };
  }
  return {
    headline: "You're on pace for the day.",
    detail:
      remainingCalories > 0
        ? `About ${remainingCalories} kcal left, and your macros are tracking together.`
        : "Calories and macros are tracking together.",
    confidence,
  };
}

const ratio = (total: number, target: number): number => (target > 0 ? round1(total / target * 100) / 100 : 0);

/** Sum a day's meals and express them against the targets. */
export function summariseDay(meals: MealPoint[], targets: MacroTargets): NutritionDay {
  const totals: MacroTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
  for (const m of meals) {
    totals.calories += m.calories;
    totals.proteinG += m.proteinG;
    totals.carbsG += m.carbsG;
    totals.fatG += m.fatG;
    totals.fiberG += m.fiberG ?? 0;
  }
  totals.calories = Math.round(totals.calories);
  totals.proteinG = round1(totals.proteinG);
  totals.carbsG = round1(totals.carbsG);
  totals.fatG = round1(totals.fatG);
  totals.fiberG = round1(totals.fiberG);

  return {
    totals,
    targets,
    progress: {
      calories: ratio(totals.calories, targets.calories),
      protein: ratio(totals.proteinG, targets.proteinG),
      carbs: ratio(totals.carbsG, targets.carbsG),
      fat: ratio(totals.fatG, targets.fatG),
      fiber: ratio(totals.fiberG, targets.fiberG),
    },
    remainingCalories: Math.round(targets.calories - totals.calories),
    mealCount: meals.length,
  };
}
