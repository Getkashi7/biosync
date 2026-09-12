/**
 * §3 fitness plans — the rules that decide how hard someone trains today.
 *
 * This is the module where a bad answer acts on a body. A week is built by
 * pure functions rather than by a model precisely so these bounds can be
 * asserted: nothing prescribes more than six sets, nothing prescribes a
 * session at all below the rest threshold, and feedback moves the next session
 * by a quarter rather than by however much a prompt felt like.
 */
import { describe, it, expect } from "vitest";
import {
  EXERCISES,
  READINESS_BANDS,
  addDays,
  buildWeek,
  exerciseBySlug,
  feedbackAdjustment,
  focusForMetric,
  scaleForReadiness,
  weekStartOf,
  type PlanFocus,
  type SessionFeedback,
} from "../fitness";

const WEEK = "2026-09-07"; // a Monday

function week(over: Partial<Parameters<typeof buildWeek>[0]> = {}) {
  return buildWeek({
    weekStart: WEEK,
    focus: "GENERAL",
    readiness: 65,
    lastFeedback: null,
    seed: 0,
    ...over,
  });
}

describe("scaleForReadiness", () => {
  /**
   * The single most important rule here. Someone who has slept badly for days
   * needs to be told to rest, not handed a lighter workout they will push
   * through anyway.
   */
  it("prescribes rest below the bottom threshold, not a lighter session", () => {
    for (const score of [0, 12, 34]) {
      const s = scaleForReadiness(score);
      expect(s.band, `readiness ${score}`).toBe("rest");
      expect(s.volume).toBe(0);
      expect(s.why).toContain("rest day");
    }
  });

  it("dials volume back in the light band, and says the score back", () => {
    const s = scaleForReadiness(48);
    expect(s.band).toBe("light");
    expect(s.volume).toBeLessThan(1);
    expect(s.why).toBe("Readiness 48 — we dialled volume back.");
  });

  it("allows a full session only at the top", () => {
    expect(scaleForReadiness(80).band).toBe("full");
    expect(scaleForReadiness(74).band).toBe("steady");
  });

  // Inventing a readiness the user never gave us is the same lie as inventing
  // any other number.
  it("says it does not know rather than assuming average", () => {
    const s = scaleForReadiness(null);
    expect(s.why).toContain("No check-in yet");
    expect(s.why).not.toMatch(/readiness \d/i);
    expect(s.volume).toBe(1);
  });

  it("clamps nonsense rather than propagating it", () => {
    expect(scaleForReadiness(-20).band).toBe("rest");
    expect(scaleForReadiness(500).band).toBe("full");
  });

  it("covers every score from 0 to 100 with exactly one band", () => {
    for (let i = 0; i <= 100; i++) {
      const matches = READINESS_BANDS.filter((b) => i <= b.upTo);
      expect(matches.length, `score ${i}`).toBeGreaterThan(0);
      expect(scaleForReadiness(i).band).toBe(matches[0]!.key);
    }
  });
});

describe("the exercise library", () => {
  it("has unique slugs and resolves them", () => {
    const slugs = EXERCISES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(exerciseBySlug("squat")?.name).toBe("Bodyweight squat");
    expect(exerciseBySlug("nope")).toBeNull();
  });

  it("covers every pattern a week can ask for", () => {
    for (const p of ["PUSH", "PULL", "LEGS", "CORE", "CARDIO", "MOBILITY"] as const) {
      expect(EXERCISES.some((e) => e.pattern === p), p).toBe(true);
    }
  });

  // A plan that assumes a barbell is useless to someone at home.
  it("prescribes nothing that needs equipment", () => {
    const gear = ["barbell", "dumbbell", "kettlebell", "machine", "cable", "bench press"];
    for (const e of EXERCISES) {
      const text = `${e.name} ${e.target}`.toLowerCase();
      for (const g of gear) expect(text, e.slug).not.toContain(g);
    }
  });
});

describe("buildWeek", () => {
  it("always returns seven consecutive days from the Monday", () => {
    const w = week();
    expect(w).toHaveLength(7);
    expect(w[0]!.date).toBe(WEEK);
    expect(w[6]!.date).toBe(addDays(WEEK, 6));
  });

  it("is deterministic — the same inputs give the same week", () => {
    expect(week()).toEqual(week());
  });

  it("plans four training days and three rest days", () => {
    const w = week();
    expect(w.filter((d) => !d.rest)).toHaveLength(4);
    expect(w.filter((d) => d.rest)).toHaveLength(3);
  });

  // The bound that stops a rule engine becoming a hazard.
  it("never prescribes more than six sets, whatever the inputs", () => {
    const focuses: PlanFocus[] = ["STRENGTH", "CONDITIONING", "GENERAL"];
    for (const focus of focuses) {
      for (const readiness of [null, 0, 35, 55, 75, 100]) {
        for (const lastFeedback of [null, "TOO_EASY", "TOO_HARD"] as (SessionFeedback | null)[]) {
          for (const day of week({ focus, readiness, lastFeedback })) {
            for (const item of day.items) {
              expect(item.sets, `${focus}/${readiness}/${lastFeedback}`).toBeGreaterThanOrEqual(1);
              expect(item.sets).toBeLessThanOrEqual(6);
            }
          }
        }
      }
    }
  });

  it("plans no session at all when readiness says rest", () => {
    const w = week({ readiness: 20 });
    expect(w.every((d) => d.rest)).toBe(true);
    expect(w.every((d) => d.items.length === 0)).toBe(true);
    // …and says why, on the days that would have been training.
    expect(w.some((d) => d.rationale.includes("rest day"))).toBe(true);
  });

  it("carries the readiness rationale onto every training day", () => {
    for (const d of week({ readiness: 48 }).filter((x) => !x.rest)) {
      expect(d.rationale).toContain("48");
    }
  });

  it("scales volume up at full readiness and down when told it was too hard", () => {
    const setsAt = (readiness: number, lastFeedback: SessionFeedback | null) =>
      week({ readiness, lastFeedback })
        .flatMap((d) => d.items)
        .reduce((n, i) => n + i.sets, 0);

    expect(setsAt(90, null)).toBeGreaterThan(setsAt(60, null));
    expect(setsAt(60, "TOO_HARD")).toBeLessThan(setsAt(60, null));
    expect(setsAt(60, "TOO_EASY")).toBeGreaterThan(setsAt(60, null));
  });

  it("starts every exercise unchecked", () => {
    expect(week().flatMap((d) => d.items).every((i) => i.done === false)).toBe(true);
  });

  it("gives each training day a readable title and a usable intensity", () => {
    for (const d of week().filter((x) => !x.rest)) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.intensity).toBeGreaterThanOrEqual(10);
      expect(d.intensity).toBeLessThanOrEqual(100);
    }
  });
});

describe("feedbackAdjustment", () => {
  // One rating should not collapse or explode someone's week.
  it("moves the next session by a quarter at most", () => {
    expect(feedbackAdjustment("TOO_HARD")).toBe(0.75);
    expect(feedbackAdjustment("TOO_EASY")).toBe(1.25);
    expect(feedbackAdjustment("JUST_RIGHT")).toBe(1);
    expect(feedbackAdjustment(null)).toBe(1);
  });
});

describe("dates", () => {
  it("finds the Monday of any week", () => {
    expect(weekStartOf("2026-09-07")).toBe("2026-09-07"); // Monday
    expect(weekStartOf("2026-09-09")).toBe("2026-09-07"); // Wednesday
    expect(weekStartOf("2026-09-13")).toBe("2026-09-07"); // Sunday
  });

  it("crosses months and years correctly", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("focusForMetric", () => {
  it("maps a goal's metric to an emphasis, defaulting to general", () => {
    expect(focusForMetric("WEIGHT")).toBe("CONDITIONING");
    expect(focusForMetric("HRV")).toBe("CONDITIONING");
    expect(focusForMetric(null)).toBe("GENERAL");
    expect(focusForMetric("SLEEP_HOURS")).toBe("GENERAL");
  });
});
