/**
 * AI fitness plans (§3) — adaptive training driven by readiness and goals.
 *
 * **Deterministic, and deliberately so.** The brief calls this "AI fitness
 * plans", and the week is built by rules rather than by a model. Two reasons,
 * and the second is the one that matters:
 *
 * 1. The brief's own example of the output — "Readiness 62 — we dialed volume
 *    back" — is a restatement of the user's own number. That is a rule. Asking
 *    a model to produce it would be generating a sentence we can already prove.
 * 2. Volume prescription acts on a body. A model that invents five hard sets
 *    for someone whose readiness is 30 can injure them, and nothing downstream
 *    would catch it. `scaleForReadiness` is the one place that decision is
 *    made, it is a pure function, and it is exhaustively tested — which is not
 *    something you can say about a prompt.
 *
 * Same posture as `nutritionRead` and §7's `suggestTreatments`: the app tells
 * the user what their own data says, and never predicts.
 *
 * The exercise library is code, reviewed in pull requests. Everything in it is
 * bodyweight or trivially substitutable, so a plan never assumes equipment the
 * user does not have.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Readiness → how hard today should be                                */
/* ------------------------------------------------------------------ */

/**
 * Bands, lowest first. A score at or below `upTo` selects the band.
 *
 * The bottom band prescribes **rest**, not a lighter session. Someone who has
 * slept badly for days does not need a reduced workout, and offering one
 * invites them to push through — the honest answer is to say so and stop.
 */
export const READINESS_BANDS = [
  { upTo: 34, key: "rest", volume: 0, label: "Rest" },
  { upTo: 54, key: "light", volume: 0.6, label: "Light" },
  { upTo: 74, key: "steady", volume: 1, label: "Steady" },
  { upTo: 100, key: "full", volume: 1.25, label: "Full" },
] as const;

export type ReadinessBand = (typeof READINESS_BANDS)[number]["key"];

export type Scaling = {
  band: ReadinessBand;
  label: string;
  /** multiplier applied to a session's planned sets */
  volume: number;
  /** the "why this today" line — restates the user's own score */
  why: string;
};

/**
 * How today's session is scaled, and why.
 *
 * A null score means nothing has been logged yet. That is NOT treated as
 * "average": we say we don't know and plan the steady session, because
 * inventing a readiness the user never gave us is the same lie as inventing
 * any other number.
 */
export function scaleForReadiness(score: number | null): Scaling {
  if (score === null) {
    return {
      band: "steady",
      label: "Steady",
      volume: 1,
      why: "No check-in yet today — this is your usual session.",
    };
  }
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const band = READINESS_BANDS.find((b) => clamped <= b.upTo) ?? READINESS_BANDS[2];

  const why =
    band.key === "rest"
      ? `Readiness ${clamped} — today is a rest day.`
      : band.key === "light"
        ? `Readiness ${clamped} — we dialled volume back.`
        : band.key === "full"
          ? `Readiness ${clamped} — you can take a full session.`
          : `Readiness ${clamped} — steady session today.`;

  return { band: band.key, label: band.label, volume: band.volume, why };
}

/* ------------------------------------------------------------------ */
/* The exercise library                                                */
/* ------------------------------------------------------------------ */

export const movementPattern = z.enum(["PUSH", "PULL", "LEGS", "CORE", "CARDIO", "MOBILITY"]);
export type MovementPattern = z.infer<typeof movementPattern>;

export type Exercise = {
  slug: string;
  name: string;
  pattern: MovementPattern;
  /** baseline sets at steady readiness */
  sets: number;
  /** reps, or seconds when `hold` */
  reps: number;
  /** true when `reps` is a duration in seconds */
  hold?: boolean;
  /** the short chip on the row — what to aim for, in the user's control */
  target: string;
};

/**
 * Bodyweight-first on purpose: a plan that assumes a barbell is useless to
 * someone at home, and "skip it if you haven't got one" is a worse experience
 * than never prescribing it.
 */
export const EXERCISES: readonly Exercise[] = [
  { slug: "push-up", name: "Push-up", pattern: "PUSH", sets: 3, reps: 10, target: "Chest to floor" },
  { slug: "pike-push-up", name: "Pike push-up", pattern: "PUSH", sets: 3, reps: 8, target: "Hips high" },
  { slug: "row", name: "Inverted row", pattern: "PULL", sets: 3, reps: 8, target: "Squeeze at top" },
  { slug: "superman", name: "Superman hold", pattern: "PULL", sets: 3, reps: 30, hold: true, target: "Slow breathing" },
  { slug: "squat", name: "Bodyweight squat", pattern: "LEGS", sets: 3, reps: 15, target: "Thighs parallel" },
  { slug: "lunge", name: "Reverse lunge", pattern: "LEGS", sets: 3, reps: 10, target: "Each side" },
  { slug: "glute-bridge", name: "Glute bridge", pattern: "LEGS", sets: 3, reps: 12, target: "Pause at top" },
  { slug: "plank", name: "Plank", pattern: "CORE", sets: 3, reps: 40, hold: true, target: "Ribs down" },
  { slug: "dead-bug", name: "Dead bug", pattern: "CORE", sets: 3, reps: 10, target: "Back flat" },
  { slug: "brisk-walk", name: "Brisk walk", pattern: "CARDIO", sets: 1, reps: 1200, hold: true, target: "Conversational" },
  { slug: "intervals", name: "Intervals", pattern: "CARDIO", sets: 6, reps: 60, hold: true, target: "Hard, then walk" },
  { slug: "hip-flow", name: "Hip mobility flow", pattern: "MOBILITY", sets: 2, reps: 45, hold: true, target: "No forcing" },
  { slug: "shoulder-flow", name: "Shoulder flow", pattern: "MOBILITY", sets: 2, reps: 45, hold: true, target: "Slow and wide" },
];

export function exerciseBySlug(slug: string): Exercise | null {
  return EXERCISES.find((e) => e.slug === slug) ?? null;
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

/** What the week emphasises. Derived from the user's goal, never guessed at. */
export const planFocus = z.enum(["STRENGTH", "CONDITIONING", "GENERAL"]);
export type PlanFocus = z.infer<typeof planFocus>;

/**
 * A goal's metric maps to a focus. `WEIGHT` leans conditioning, strength-shaped
 * goals lean strength, and anything else is GENERAL — which is a real answer,
 * not a fallback for "we couldn't tell".
 */
export function focusForMetric(metric: string | null | undefined): PlanFocus {
  if (metric === "WEIGHT") return "CONDITIONING";
  if (metric === "HRV" || metric === "RESTING_HR") return "CONDITIONING";
  return "GENERAL";
}

/** The pattern order each focus runs through the training days. */
const FOCUS_PATTERNS: Record<PlanFocus, MovementPattern[][]> = {
  STRENGTH: [["PUSH", "CORE"], ["LEGS", "CORE"], ["PULL", "CORE"], ["LEGS", "PUSH"]],
  CONDITIONING: [["CARDIO", "CORE"], ["LEGS", "CARDIO"], ["CARDIO", "PULL"], ["LEGS", "CORE"]],
  GENERAL: [["PUSH", "LEGS"], ["CARDIO", "CORE"], ["PULL", "LEGS"], ["CARDIO", "MOBILITY"]],
};

/** Which weekdays train. Index 0 = Monday. Four sessions, spaced. */
const TRAINING_DAYS = [0, 2, 4, 5];

export type PlannedExercise = {
  slug: string;
  name: string;
  sets: number;
  reps: number;
  hold: boolean;
  target: string;
  done: boolean;
};

export type PlannedSession = {
  /** device-local YYYY-MM-DD */
  date: string;
  /** "" on a rest day */
  title: string;
  /** 0–100, drives the tint on the week spine */
  intensity: number;
  /** restates the user's own readiness */
  rationale: string;
  items: PlannedExercise[];
  rest: boolean;
};

export const sessionFeedback = z.enum(["TOO_HARD", "JUST_RIGHT", "TOO_EASY"]);
export type SessionFeedback = z.infer<typeof sessionFeedback>;

/**
 * Yesterday's feedback nudges today's volume.
 *
 * Deliberately gentle and bounded: one rating moves the next session by a
 * quarter, never more. A single "too easy" should not produce a session that
 * hurts someone, and a single "too hard" should not collapse their week.
 */
export function feedbackAdjustment(feedback: SessionFeedback | null): number {
  if (feedback === "TOO_HARD") return 0.75;
  if (feedback === "TOO_EASY") return 1.25;
  return 1;
}

function scaleSets(base: number, factor: number): number {
  // Never below one working set, never above six — the bounds are the whole
  // point of scaling by rule rather than by free-form generation.
  return Math.max(1, Math.min(6, Math.round(base * factor)));
}

function pickExercises(patterns: MovementPattern[], seed: number): Exercise[] {
  return patterns.map((p, i) => {
    const inPattern = EXERCISES.filter((e) => e.pattern === p);
    const chosen = inPattern[(seed + i) % inPattern.length];
    // The library always has at least one of every pattern; the fallback keeps
    // the return type honest rather than asserting.
    return chosen ?? EXERCISES[0]!;
  });
}

export type BuildWeekInput = {
  /** Monday of the target week, YYYY-MM-DD */
  weekStart: string;
  focus: PlanFocus;
  /** today's readiness, or null when nothing is logged */
  readiness: number | null;
  /** the most recent rating the user gave, if any */
  lastFeedback: SessionFeedback | null;
  /** a stable number so the same week always produces the same plan */
  seed: number;
};

/** Add `days` to a YYYY-MM-DD, staying on the calendar. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build one week, deterministically.
 *
 * The same inputs always produce the same week — which is what makes it
 * reviewable, testable, and explicable to the person following it.
 */
export function buildWeek(input: BuildWeekInput): PlannedSession[] {
  const scaling = scaleForReadiness(input.readiness);
  const factor = scaling.volume * feedbackAdjustment(input.lastFeedback);
  const patterns = FOCUS_PATTERNS[input.focus];

  return Array.from({ length: 7 }, (_, offset): PlannedSession => {
    const date = addDays(input.weekStart, offset);
    const slot = TRAINING_DAYS.indexOf(offset);
    const isTraining = slot !== -1 && scaling.band !== "rest";

    if (!isTraining) {
      const resting = scaling.band === "rest" && slot !== -1;
      return {
        date,
        title: "",
        intensity: 0,
        rationale: resting ? scaling.why : "Scheduled rest.",
        items: [],
        rest: true,
      };
    }

    const dayPatterns = patterns[slot % patterns.length] ?? ["LEGS", "CORE"];
    const items = pickExercises(dayPatterns, input.seed + offset).map((e) => ({
      slug: e.slug,
      name: e.name,
      sets: scaleSets(e.sets, factor),
      reps: e.reps,
      hold: e.hold === true,
      target: e.target,
      done: false,
    }));

    return {
      date,
      title: dayPatterns.map(titleFor).join(" · "),
      intensity: Math.max(10, Math.min(100, Math.round(factor * 70))),
      rationale: scaling.why,
      items,
      rest: false,
    };
  });
}

function titleFor(p: MovementPattern): string {
  switch (p) {
    case "PUSH":
      return "Push";
    case "PULL":
      return "Pull";
    case "LEGS":
      return "Legs";
    case "CORE":
      return "Core";
    case "CARDIO":
      return "Cardio";
    case "MOBILITY":
      return "Mobility";
  }
}

/** Monday of the week containing `date`, as YYYY-MM-DD. */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  // getUTCDay: 0 = Sunday. Shift so Monday is 0.
  const shift = (d.getUTCDay() + 6) % 7;
  return addDays(date, -shift);
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export const fitnessWeekInput = z.object({
  /** any day in the week the client wants, device-local */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const toggleExerciseInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slug: z.string().min(1).max(64),
  done: z.boolean(),
});

export const completeSessionInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  feedback: sessionFeedback,
});

export type FitnessWeekInput = z.infer<typeof fitnessWeekInput>;
export type ToggleExerciseInput = z.infer<typeof toggleExerciseInput>;
export type CompleteSessionInput = z.infer<typeof completeSessionInput>;
