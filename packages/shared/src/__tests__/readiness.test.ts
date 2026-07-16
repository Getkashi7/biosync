/**
 * Readiness formula unit tests: hand-computed weighted scores for full data,
 * every missing-component combination (reweighting), the component edge cases,
 * the confidence flag, and the trailing baseline mean.
 */
import { describe, it, expect } from "vitest";
import { baselineMean, computeReadiness, type ReadinessInputs } from "../readiness";

/** All four components present; each easy to score by hand. */
const full: ReadinessInputs = {
  sleepHours: 6, //           6/8            → 75
  sleepQuality: 3, //         (3−1)/4        → 50
  energy: 3,
  mood: 3, //                 ((3+3)/2−1)/4  → 50
  restingHr: 60,
  restingHrBaseline: 60, //   at baseline    → 100
};

const none: ReadinessInputs = {
  sleepHours: null,
  sleepQuality: null,
  energy: null,
  mood: null,
  restingHr: null,
  restingHrBaseline: null,
};

describe("baselineMean", () => {
  it("is null with no readings", () => {
    expect(baselineMean([])).toBeNull();
  });

  it("is the reading itself with one", () => {
    expect(baselineMean([60])).toBe(60);
  });

  it("averages multiple readings", () => {
    expect(baselineMean([50, 70])).toBe(60);
    expect(baselineMean([55, 60, 65])).toBe(60);
  });
});

describe("computeReadiness — full data", () => {
  it("weights 40/20/20/20 and rounds", () => {
    const r = computeReadiness(full);
    // 0.4·75 + 0.2·50 + 0.2·100 + 0.2·50 = 30 + 10 + 20 + 10 = 70
    expect(r.score).toBe(70);
    expect(r.lowConfidence).toBe(false);
  });

  it("perfect day scores 100", () => {
    const r = computeReadiness({
      sleepHours: 8,
      sleepQuality: 5,
      energy: 5,
      mood: 5,
      restingHr: 55,
      restingHrBaseline: 60,
    });
    expect(r.score).toBe(100);
  });

  it("carries raw values in the breakdown", () => {
    const r = computeReadiness(full);
    expect(r.components.sleep).toMatchObject({ hours: 6, weight: 0.4 });
    expect(r.components.quality).toMatchObject({ rating: 3 });
    expect(r.components.restingHr).toMatchObject({ current: 60, baseline: 60 });
    expect(r.components.energyMood).toMatchObject({ energy: 3, mood: 3 });
  });
});

describe("computeReadiness — reweighting per missing component", () => {
  it("missing sleep → (50·0.2 + 100·0.2 + 50·0.2) / 0.6", () => {
    const r = computeReadiness({ ...full, sleepHours: null });
    expect(r.score).toBe(67); // 40/0.6 = 66.67 → 67
    expect(r.components.sleep).toBeNull();
    expect(r.lowConfidence).toBe(false);
  });

  it("missing quality → (75·0.4 + 100·0.2 + 50·0.2) / 0.8", () => {
    const r = computeReadiness({ ...full, sleepQuality: null });
    expect(r.score).toBe(75); // 60/0.8
  });

  it("missing resting HR (no reading) → (75·0.4 + 50·0.2 + 50·0.2) / 0.8", () => {
    const r = computeReadiness({ ...full, restingHr: null });
    expect(r.score).toBe(63); // 50/0.8 = 62.5 → 63
    expect(r.components.restingHr).toBeNull();
  });

  it("a reading without a baseline drops the HR component the same way", () => {
    const r = computeReadiness({ ...full, restingHrBaseline: null });
    expect(r.components.restingHr).toBeNull();
    expect(r.score).toBe(63);
  });

  it("missing energy/mood → (75·0.4 + 50·0.2 + 100·0.2) / 0.8", () => {
    const r = computeReadiness({ ...full, energy: null, mood: null });
    expect(r.score).toBe(75); // 60/0.8
  });

  it("energy without mood drops the pair", () => {
    const r = computeReadiness({ ...full, mood: null });
    expect(r.components.energyMood).toBeNull();
  });
});

describe("computeReadiness — component edges", () => {
  it("oversleeping caps sleep at 100", () => {
    const r = computeReadiness({ ...none, sleepHours: 10, sleepQuality: 3 });
    expect(r.components.sleep?.score).toBe(100);
  });

  it("zero sleep scores 0", () => {
    const r = computeReadiness({ ...none, sleepHours: 0, sleepQuality: 3 });
    expect(r.components.sleep?.score).toBe(0);
  });

  it("quality 1 → 0, quality 5 → 100", () => {
    expect(computeReadiness({ ...none, sleepQuality: 1 }).components.quality?.score).toBe(0);
    expect(computeReadiness({ ...none, sleepQuality: 5 }).components.quality?.score).toBe(100);
  });

  it("resting HR below baseline caps at 100", () => {
    const r = computeReadiness({ ...none, restingHr: 50, restingHrBaseline: 60 });
    expect(r.components.restingHr?.score).toBe(100);
  });

  it("resting HR 10% above baseline scores 50", () => {
    const r = computeReadiness({ ...none, restingHr: 66, restingHrBaseline: 60 });
    expect(r.components.restingHr?.score).toBeCloseTo(50);
  });

  it("resting HR 20%+ above baseline scores 0", () => {
    const r = computeReadiness({ ...none, restingHr: 72, restingHrBaseline: 60 });
    expect(r.components.restingHr?.score).toBeCloseTo(0);
    const worse = computeReadiness({ ...none, restingHr: 90, restingHrBaseline: 60 });
    expect(worse.components.restingHr?.score).toBe(0);
  });
});

describe("computeReadiness — confidence", () => {
  it("one component → its score, low confidence", () => {
    const r = computeReadiness({ ...none, sleepHours: 6, sleepQuality: null });
    expect(r.score).toBe(75);
    expect(r.lowConfidence).toBe(true);
  });

  it("two components → not low confidence", () => {
    const r = computeReadiness({ ...none, sleepHours: 6, sleepQuality: 3 });
    expect(r.lowConfidence).toBe(false);
  });

  it("nothing logged → null score, low confidence", () => {
    const r = computeReadiness(none);
    expect(r.score).toBeNull();
    expect(r.lowConfidence).toBe(true);
    expect(Object.values(r.components).every((c) => c === null)).toBe(true);
  });
});
