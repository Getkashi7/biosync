/**
 * Readiness score — a 0–100 daily "how ready is your body" number computed
 * server-side from the day's check-in and resting-HR metrics. Pure logic (like
 * streak.ts): the API gathers the inputs, this file turns them into a score, so
 * the formula is unit-testable without a database.
 *
 * Components and weights:
 *   sleep      0.4  — last night's hours vs an 8h target (oversleep caps at 100)
 *   quality    0.2  — sleep quality rating 1–5
 *   restingHr  0.2  — latest reading vs the user's own trailing 14-day baseline;
 *                     at/below baseline = 100, +20% or more above = 0, linear between
 *   energyMood 0.2  — mean of the check-in's energy and mood ratings 1–5
 *
 * A missing component is dropped and the score reweighted across what's present.
 * Fewer than two components → lowConfidence. Zero components → score null.
 */
import { z } from "zod";
import { dateStringSchema } from "./checkin";

export const readinessInput = z.object({
  /** the user's device-local "today", so the check-in lookup is timezone-correct */
  today: dateStringSchema,
});

export type ReadinessInput = z.infer<typeof readinessInput>;

/** Raw ingredients, each null when not logged. Energy and mood come as a pair. */
export type ReadinessInputs = {
  sleepHours: number | null;
  /** 1–5 */
  sleepQuality: number | null;
  /** 1–5 */
  energy: number | null;
  /** 1–5 */
  mood: number | null;
  /** latest resting-HR reading (bpm) */
  restingHr: number | null;
  /** trailing 14-day resting-HR mean (bpm) */
  restingHrBaseline: number | null;
};

export type ReadinessComponents = {
  sleep: { score: number; weight: number; hours: number } | null;
  quality: { score: number; weight: number; rating: number } | null;
  restingHr: { score: number; weight: number; current: number; baseline: number } | null;
  energyMood: { score: number; weight: number; energy: number; mood: number } | null;
};

export type Readiness = {
  /** 0–100, or null when nothing has been logged yet */
  score: number | null;
  components: ReadinessComponents;
  /** true when fewer than two components are present */
  lowConfidence: boolean;
};

const WEIGHTS = { sleep: 0.4, quality: 0.2, restingHr: 0.2, energyMood: 0.2 } as const;

const SLEEP_TARGET_HOURS = 8;
/** resting HR this far above baseline (as a ratio) scores 0 */
const HR_ELEVATED_RATIO = 1.2;

/** Trailing mean for the resting-HR baseline; null when there are no readings. */
export function baselineMean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 1–5 rating → 0–100 (1 maps to 0, 5 maps to 100). */
const ratingScore = (rating: number): number => ((rating - 1) / 4) * 100;

export function computeReadiness(inputs: ReadinessInputs): Readiness {
  const components: ReadinessComponents = {
    sleep:
      inputs.sleepHours !== null
        ? {
            score: clamp01(inputs.sleepHours / SLEEP_TARGET_HOURS) * 100,
            weight: WEIGHTS.sleep,
            hours: inputs.sleepHours,
          }
        : null,
    quality:
      inputs.sleepQuality !== null
        ? { score: ratingScore(inputs.sleepQuality), weight: WEIGHTS.quality, rating: inputs.sleepQuality }
        : null,
    restingHr:
      inputs.restingHr !== null && inputs.restingHrBaseline !== null
        ? {
            score:
              clamp01((HR_ELEVATED_RATIO - inputs.restingHr / inputs.restingHrBaseline) / (HR_ELEVATED_RATIO - 1)) *
              100,
            weight: WEIGHTS.restingHr,
            current: inputs.restingHr,
            baseline: inputs.restingHrBaseline,
          }
        : null,
    energyMood:
      inputs.energy !== null && inputs.mood !== null
        ? {
            score: ratingScore((inputs.energy + inputs.mood) / 2),
            weight: WEIGHTS.energyMood,
            energy: inputs.energy,
            mood: inputs.mood,
          }
        : null,
  };

  const present = Object.values(components).filter((c) => c !== null);
  if (present.length === 0) {
    return { score: null, components, lowConfidence: true };
  }

  const totalWeight = present.reduce((sum, c) => sum + c.weight, 0);
  const weighted = present.reduce((sum, c) => sum + c.score * c.weight, 0);

  return {
    score: Math.round(weighted / totalWeight),
    components,
    lowConfidence: present.length < 2,
  };
}
