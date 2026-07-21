import { describe, it, expect } from "vitest";
import {
  DEFAULT_TARGETS,
  macroTargets,
  nutritionRead,
  parseMacroEstimate,
  summariseDay,
  type MealPoint,
} from "../index";

const meal = (over: Partial<MealPoint> = {}): MealPoint => ({
  calories: 500,
  proteinG: 30,
  carbsG: 50,
  fatG: 20,
  fiberG: 5,
  ...over,
});

describe("macroTargets", () => {
  it("falls back to adult defaults without a weight", () => {
    expect(macroTargets(null)).toEqual(DEFAULT_TARGETS);
  });

  it("ignores a nonsensical weight", () => {
    expect(macroTargets(0)).toEqual(DEFAULT_TARGETS);
    expect(macroTargets(-70)).toEqual(DEFAULT_TARGETS);
    expect(macroTargets(Number.NaN)).toEqual(DEFAULT_TARGETS);
  });

  it("falls back to defaults for an implausibly low weight (a lb value typed as kg)", () => {
    // 65 lb → 29.5 kg would otherwise yield an ~885 kcal target
    expect(macroTargets(29.5)).toEqual(DEFAULT_TARGETS);
    expect(macroTargets(34.9)).toEqual(DEFAULT_TARGETS);
    // and never reports a target low enough to push someone to under-eat
    expect(macroTargets(29.5).calories).toBe(DEFAULT_TARGETS.calories);
  });

  it("falls back to defaults for an implausibly high weight", () => {
    expect(macroTargets(251)).toEqual(DEFAULT_TARGETS);
  });

  it("still scales at the edges of the plausible range", () => {
    expect(macroTargets(35)).not.toEqual(DEFAULT_TARGETS);
    expect(macroTargets(250)).not.toEqual(DEFAULT_TARGETS);
  });

  it("scales to bodyweight, with carbs taking the remaining energy", () => {
    const t = macroTargets(70);
    expect(t.calories).toBe(2100); // 30 kcal/kg
    expect(t.proteinG).toBe(112); // 1.6 g/kg
    expect(t.fatG).toBe(56); // 0.8 g/kg
    // remaining = 2100 - (112*4) - (56*9) = 2100 - 448 - 504 = 1148 → /4
    expect(t.carbsG).toBe(287);
    expect(t.fiberG).toBe(29); // 2.1 * 14
  });

  it("keeps fibre above the floor for a small intake", () => {
    expect(macroTargets(40).fiberG).toBeGreaterThanOrEqual(20);
  });
});

describe("summariseDay", () => {
  const targets = macroTargets(70);

  it("returns zeroed totals for an empty day", () => {
    const d = summariseDay([], targets);
    expect(d.totals).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
    expect(d.mealCount).toBe(0);
    expect(d.remainingCalories).toBe(targets.calories);
    expect(d.progress.protein).toBe(0);
  });

  it("sums meals and counts them", () => {
    const d = summariseDay([meal(), meal({ calories: 300, proteinG: 20, carbsG: 10, fatG: 5, fiberG: null })], targets);
    expect(d.totals.calories).toBe(800);
    expect(d.totals.proteinG).toBe(50);
    expect(d.totals.fiberG).toBe(5); // null fibre counts as 0
    expect(d.mealCount).toBe(2);
    expect(d.remainingCalories).toBe(targets.calories - 800);
  });

  it("expresses progress as a ratio of target, unclamped on overshoot", () => {
    const d = summariseDay([meal({ proteinG: targets.proteinG * 2 })], targets);
    expect(d.progress.protein).toBeCloseTo(2, 1);
  });

  it("goes negative on remaining calories once over target", () => {
    const d = summariseDay([meal({ calories: targets.calories + 200 })], targets);
    expect(d.remainingCalories).toBe(-200);
  });
});

describe("nutritionRead", () => {
  const targets = macroTargets(70);

  it("says nothing on an empty day", () => {
    expect(nutritionRead(summariseDay([], targets))).toBeNull();
  });

  it("flags trailing protein with the gap in grams", () => {
    // well under the protein target, but calories/fibre fine
    const day = summariseDay([meal({ proteinG: 10, fiberG: targets.fiberG })], targets);
    const read = nutritionRead(day)!;
    expect(read.headline).toBe("Protein is trailing today.");
    expect(read.detail).toContain(`${Math.round(targets.proteinG - 10)} g`);
  });

  it("flags going over the calorie target before anything else", () => {
    const day = summariseDay([meal({ calories: targets.calories + 300, proteinG: 0 })], targets);
    expect(nutritionRead(day)!.headline).toBe("You're past today's calorie target.");
  });

  it("nudges on low fibre once protein is fine", () => {
    const day = summariseDay([meal({ proteinG: targets.proteinG, fiberG: 1 })], targets);
    expect(nutritionRead(day)!.headline).toBe("Fibre is running low today.");
  });

  it("confirms pace when everything is tracking", () => {
    const day = summariseDay([meal({ proteinG: targets.proteinG, fiberG: targets.fiberG })], targets);
    expect(nutritionRead(day)!.headline).toBe("You're on pace for the day.");
  });

  it("grows confidence with the number of meals, capped at 4", () => {
    expect(nutritionRead(summariseDay([meal()], targets))!.confidence).toBe(1);
    expect(nutritionRead(summariseDay([meal(), meal(), meal()], targets))!.confidence).toBe(3);
    const many = [meal(), meal(), meal(), meal(), meal(), meal()];
    expect(nutritionRead(summariseDay(many, targets))!.confidence).toBe(4);
  });
});

describe("parseMacroEstimate", () => {
  it("parses a well-formed estimate", () => {
    const e = parseMacroEstimate(
      JSON.stringify({ calories: 420, proteinG: 24.4, carbsG: 30, fatG: 18, fiberG: 3, items: ["2 eggs", "toast"] }),
    );
    expect(e).toEqual({ calories: 420, proteinG: 24.4, carbsG: 30, fatG: 18, fiberG: 3, items: ["2 eggs", "toast"] });
  });

  it("coerces numeric strings and rounds", () => {
    const e = parseMacroEstimate(JSON.stringify({ calories: "420.6", proteinG: "24.44", carbsG: 30, fatG: 18 }));
    expect(e!.calories).toBe(421);
    expect(e!.proteinG).toBe(24.4);
    expect(e!.fiberG).toBeUndefined();
  });

  it("returns null for non-JSON", () => {
    expect(parseMacroEstimate("Sure! Here's the estimate:")).toBeNull();
  });

  it("returns null when a required macro is missing", () => {
    expect(parseMacroEstimate(JSON.stringify({ calories: 400, proteinG: 20 }))).toBeNull();
  });

  it("returns null for out-of-range values", () => {
    expect(parseMacroEstimate(JSON.stringify({ calories: 99999, proteinG: 20, carbsG: 30, fatG: 10 }))).toBeNull();
    expect(parseMacroEstimate(JSON.stringify({ calories: -5, proteinG: 20, carbsG: 30, fatG: 10 }))).toBeNull();
  });
});
