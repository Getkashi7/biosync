/**
 * What the AI coach is told about someone's body.
 *
 * The bug these pin down: the Ask screen promises "I read your last 30 days —
 * sleep, heart, glucose", and the model was handed the latest check-in with no
 * date on it plus one value per metric. Asked about her week, the coach
 * answered from a single night and sounded sure of itself. So the invariants
 * here are about honesty, not formatting:
 *
 *  - the window really is 30 days, and says so
 *  - every average carries how many logs it came from
 *  - an absent series reads as absent — never 0, never NaN
 *  - a returning user is not told they have never logged anything
 *  - thin data is labelled thin
 *
 * Pure function, no database — `buildCoachContext` does the reading, this does
 * the saying, and the saying is what reaches the user.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ prisma: {} }));

const { formatCoachContext, COACH_WINDOW_DAYS } = await import("../lib/coachContext");

const TODAY = "2026-11-01";

type Checkin = {
  date: string;
  sleepHours: number;
  sleepQuality: number;
  energy: number;
  mood: number;
  weightKg: number | null;
};

/** A check-in with sensible defaults, so each test states only what it means. */
function checkin(date: string, over: Partial<Checkin> = {}): Checkin {
  return { date, sleepHours: 7, sleepQuality: 3, energy: 3, mood: 3, weightKg: null, ...over };
}

function format(over: Partial<Parameters<typeof formatCoachContext>[0]> = {}): string {
  return formatCoachContext({
    today: TODAY,
    windowDays: COACH_WINDOW_DAYS,
    checkins: [],
    readiness: [],
    metrics: [],
    priorCheckinDate: null,
    ...over,
  });
}

describe("the window it claims to cover", () => {
  it("names 30 days and the date it ends on — the number the UI promises", () => {
    expect(COACH_WINDOW_DAYS).toBe(30);
    expect(format()).toContain(`Window: the 30 days ending ${TODAY}`);
  });

  it("counts the days actually logged, not the days in the window", () => {
    const checkins = ["2026-11-01", "2026-10-31", "2026-10-28"].map((d) => checkin(d));
    expect(format({ checkins })).toContain("Check-ins: 3 of those 30 days logged");
  });
});

describe("nothing invented", () => {
  it("says a series is absent rather than printing a zero", () => {
    const out = format();
    expect(out).toContain("Check-ins: none logged yet, ever.");
    expect(out).toContain("Readiness: nothing scored in this window.");
    expect(out).toContain("none in this window.");
    expect(out).not.toMatch(/\b0\/5\b/);
  });

  it("never emits NaN, Infinity or undefined for any shape of input", () => {
    const shapes = [
      {},
      { checkins: [checkin(TODAY)] },
      { readiness: [{ date: TODAY, score: 70 }] },
      { metrics: [{ type: "HRV", value: 44, date: TODAY }] },
      { checkins: [checkin(TODAY, { weightKg: 62.4 })], readiness: [{ date: TODAY, score: 70 }] },
      // A type the unit map has never heard of.
      { metrics: [{ type: "SOMETHING_NEW", value: 1.5, date: TODAY }] },
    ];
    for (const shape of shapes) {
      const out = format(shape);
      expect(out).not.toMatch(/NaN|Infinity|undefined|null/);
    }
  });

  it("omits the weight line entirely when no check-in carried a weight", () => {
    const out = format({ checkins: [checkin(TODAY), checkin("2026-10-31")] });
    expect(out).toContain("Sleep:");
    expect(out).not.toContain("Weight:");
  });

  it("reports a weight that was logged on only some days, from those days only", () => {
    const out = format({
      checkins: [checkin(TODAY, { weightKg: 62.4 }), checkin("2026-10-31"), checkin("2026-10-30")],
    });
    expect(out).toContain("Weight: latest 62.4kg (2026-11-01) · last 7 days avg 62.4kg (1 log)");
  });
});

describe("how solid the numbers are", () => {
  it("puts the sample size on every average", () => {
    const checkins = [
      checkin("2026-11-01", { energy: 2 }),
      checkin("2026-10-31", { energy: 4 }),
      // Inside the window, but older than both 7-day slices.
      checkin("2026-10-10", { energy: 5 }),
    ];
    const out = format({ checkins });
    expect(out).toContain("Energy: latest 2/5 (2026-11-01) · last 7 days avg 3/5 (2 logs) · 30-day avg 3.7/5 (3)");
  });

  it("separates the last 7 days from the 7 before, so a change is visible", () => {
    const checkins = [
      checkin("2026-11-01", { sleepHours: 6 }),
      checkin("2026-10-30", { sleepHours: 6 }),
      checkin("2026-10-24", { sleepHours: 8 }),
      checkin("2026-10-22", { sleepHours: 8 }),
    ];
    const out = format({ checkins });
    expect(out).toContain("last 7 days avg 6h (2 logs)");
    expect(out).toContain("the 7 days before avg 8h (2)");
  });

  it("labels thin data as thin, so the coach can't call three days a trend", () => {
    const out = format({ checkins: [checkin(TODAY), checkin("2026-10-31"), checkin("2026-10-30")] });
    expect(out).toContain("Only 3 days of check-ins here");
    expect(out).toContain("Don't present it as a trend");
  });

  it("drops that warning once there is enough to describe a week", () => {
    const checkins = ["2026-11-01", "2026-10-31", "2026-10-30", "2026-10-29"].map((d) => checkin(d));
    expect(format({ checkins })).not.toContain("Don't present it as a trend");
  });

  it("tells the model to stop when the window is empty", () => {
    expect(format()).toContain("nothing in this window to ground an answer in");
  });
});

describe("a returning user", () => {
  it("is not told they have never logged anything", () => {
    const out = format({ priorCheckinDate: "2026-08-02" });
    expect(out).toContain("Check-ins: none in this window. The most recent one before it was 2026-08-02.");
    expect(out).not.toContain("none logged yet, ever");
  });
});

describe("metrics", () => {
  it("labels each type with the unit the app shows the user", () => {
    const out = format({
      metrics: [
        { type: "RESTING_HR", value: 58, date: TODAY },
        { type: "HRV", value: 44, date: TODAY },
        { type: "GLUCOSE", value: 92.5, date: TODAY },
      ],
    });
    expect(out).toContain("Resting HR: latest 58 bpm");
    expect(out).toContain("HRV: latest 44 ms");
    expect(out).toContain("Glucose: latest 92.5 mg/dL");
  });

  it("orders types stably, so the same data always builds the same prompt", () => {
    const metrics = [
      { type: "RESTING_HR", value: 58, date: TODAY },
      { type: "HRV", value: 44, date: TODAY },
    ];
    expect(format({ metrics })).toBe(format({ metrics: [...metrics].reverse() }));
  });

  it("reads the latest from the newest date whatever order the rows arrive in", () => {
    const out = format({
      metrics: [
        { type: "RESTING_HR", value: 70, date: "2026-10-28" },
        { type: "RESTING_HR", value: 58, date: "2026-11-01" },
        { type: "RESTING_HR", value: 64, date: "2026-10-30" },
      ],
    });
    expect(out).toContain("Resting HR: latest 58 bpm (2026-11-01)");
  });
});

describe("the check-in block", () => {
  it("reports the most recent date, so the coach can say how fresh it is", () => {
    const out = format({ checkins: [checkin("2026-10-29"), checkin("2026-10-31")] });
    expect(out).toContain("most recent 2026-10-31");
  });

  it("names every series a check-in carries", () => {
    const out = format({ checkins: [checkin(TODAY, { weightKg: 60 })] });
    for (const series of ["Sleep:", "Sleep quality:", "Energy:", "Mood:", "Weight:"]) {
      expect(out).toContain(series);
    }
  });
});
