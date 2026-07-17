/**
 * Insight generation tests: each card's wording + thresholds, and the ordering
 * of the assembled feed. Pure — no database, no clock (a fixed "today").
 */
import { describe, it, expect } from "vitest";
import { computeInsights, type CheckinPoint, type InsightsData, type ReadinessPoint } from "../insights";

const TODAY = "2026-07-17";

/** Build a check-in `daysAgo` days before TODAY with sensible defaults. */
function checkin(daysAgo: number, over: Partial<CheckinPoint> = {}): CheckinPoint {
  const ms = Date.UTC(2026, 6, 17) - daysAgo * 86_400_000;
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { date, sleepHours: 7, sleepQuality: 3, energy: 3, mood: 3, weightKg: null, ...over };
}

function readiness(daysAgo: number, score: number): ReadinessPoint {
  return { ...checkin(daysAgo), score } as unknown as ReadinessPoint;
}

const empty: InsightsData = {
  today: TODAY,
  streak: 0,
  checkins: [],
  recentHr: [],
  earlierHr: [],
  weightDayCount: 0,
  readiness: [],
};

const byId = (data: InsightsData) => new Map(computeInsights(data).map((i) => [i.id, i]));

describe("computeInsights — empty", () => {
  it("returns no cards when there is nothing to say", () => {
    expect(computeInsights(empty)).toEqual([]);
  });
});

describe("streak card", () => {
  it("is omitted at streak 0", () => {
    expect(byId({ ...empty, streak: 0 }).has("streak")).toBe(false);
  });

  it("counts toward a full week with a 'tomorrow' sub-line at 6", () => {
    const s = byId({ ...empty, streak: 6 }).get("streak")!;
    expect(s.headline).toBe("You’re on a 6-day check-in streak.");
    expect(s.subline).toBe("Tomorrow makes it a full week.");
    expect(s.emoji).toBe("🔥");
    expect(s.section).toBe("today");
  });

  it("counts days remaining below a full week", () => {
    expect(byId({ ...empty, streak: 3 }).get("streak")!.subline).toBe("4 more days to a full week.");
  });

  it("rolls to the next weekly milestone past 7", () => {
    expect(byId({ ...empty, streak: 8 }).get("streak")!.subline).toBe("6 more days to 2 weeks.");
  });
});

describe("readiness trend card", () => {
  it("needs at least two days", () => {
    expect(byId({ ...empty, readiness: [readiness(0, 80)] }).has("readiness")).toBe(false);
  });

  it("reads as trending up with a signed delta and today's score", () => {
    const r = byId({
      ...empty,
      readiness: [readiness(3, 73), readiness(2, 76), readiness(1, 79), readiness(0, 82)],
    }).get("readiness")!;
    expect(r.headline).toBe("Readiness is trending up.");
    expect(r.subline).toBe("+9 over the last 3 days · 82 today");
    expect(r.delta).toEqual({ label: "+9", direction: "up" });
    expect(r.accent).toBe("gradient");
  });

  it("reads as trending down", () => {
    const r = byId({ ...empty, readiness: [readiness(2, 80), readiness(0, 68)] }).get("readiness")!;
    expect(r.headline).toBe("Readiness is trending down.");
    expect(r.delta).toEqual({ label: "-12", direction: "down" });
  });

  it("holds steady inside the epsilon", () => {
    const r = byId({ ...empty, readiness: [readiness(2, 80), readiness(0, 81)] }).get("readiness")!;
    expect(r.headline).toBe("Readiness is holding steady.");
    expect(r.delta!.direction).toBe("steady");
    expect(r.delta!.label).toBe("steady");
  });

  it("says 'recently' when the latest snapshot isn't today", () => {
    const r = byId({ ...empty, readiness: [readiness(4, 70), readiness(1, 82)] }).get("readiness")!;
    expect(r.subline.endsWith("· 82 recently")).toBe(true);
  });
});

describe("sleep card", () => {
  it("needs at least two nights this week", () => {
    expect(byId({ ...empty, checkins: [checkin(0, { sleepHours: 7 })] }).has("sleep")).toBe(false);
  });

  it("averages the week and compares to last week in minutes", () => {
    const checkins = [
      ...[1, 2, 3].map((d) => checkin(d, { sleepHours: 7.2 })), // this week avg 7.2
      ...[8, 9, 10].map((d) => checkin(d, { sleepHours: 6.9 })), // last week avg 6.9
    ];
    const s = byId({ ...empty, checkins }).get("sleep")!;
    expect(s.headline).toBe("You’ve averaged 7h 12m of sleep this week.");
    expect(s.subline).toBe("About 18 min more than last week.");
    expect(s.sparkline).toEqual([7.2, 7.2, 7.2]);
  });

  it("omits the sparkline under three nights", () => {
    const s = byId({ ...empty, checkins: [checkin(1, { sleepHours: 7 }), checkin(2, { sleepHours: 8 })] }).get("sleep")!;
    expect(s.sparkline).toBeUndefined();
    expect(s.subline).toBe("Across 2 nights so far.");
  });
});

describe("resting HR card", () => {
  it("needs at least two recent readings", () => {
    expect(byId({ ...empty, recentHr: [58] }).has("restingHr")).toBe(false);
  });

  it("reads steady with a usual range when unchanged vs the prior week", () => {
    const r = byId({ ...empty, recentHr: [57, 58, 60, 58], earlierHr: [58, 59] }).get("restingHr")!;
    expect(r.headline).toBe("Resting heart rate is steady around 58 bpm.");
    expect(r.subline).toBe("Within your usual 57–60 range.");
    expect(r.delta).toEqual({ label: "steady", direction: "steady" });
  });

  it("reads rising when the recent mean climbs past the threshold", () => {
    const r = byId({ ...empty, recentHr: [64, 66], earlierHr: [57, 58] }).get("restingHr")!;
    expect(r.headline).toContain("edging up");
    expect(r.delta).toEqual({ label: "rising", direction: "up" });
  });

  it("is steady when there is no prior-week baseline to compare", () => {
    expect(byId({ ...empty, recentHr: [60, 90] }).get("restingHr")!.delta!.direction).toBe("steady");
  });
});

describe("energy × sleep card", () => {
  const highOnSleep: CheckinPoint[] = [
    ...[1, 2, 3, 4].map((d) => checkin(d, { sleepHours: 8, energy: 5 })),
    ...[8, 9, 10].map((d) => checkin(d, { sleepHours: 5.5, energy: 2 })),
  ];

  it("fires when energy is clearly higher on 7h+ nights", () => {
    const e = byId({ ...empty, checkins: highOnSleep }).get("energySleep")!;
    expect(e.headline).toBe("Your energy has been highest on days you slept 7h+.");
    expect(e.subline).toBe("Seen across 4 of your check-ins.");
    expect(e.accent).toBe("coral");
  });

  it("is omitted without enough check-ins", () => {
    expect(byId({ ...empty, checkins: highOnSleep.slice(0, 4) }).has("energySleep")).toBe(false);
  });

  it("is omitted when the link is weak", () => {
    const flat = [1, 2, 3, 4, 8, 9].map((d) => checkin(d, { sleepHours: d < 5 ? 8 : 5, energy: 3 }));
    expect(byId({ ...empty, checkins: flat }).has("energySleep")).toBe(false);
  });
});

describe("weight nudge", () => {
  const active = [1, 2, 3].map((d) => checkin(d));

  it("nudges an active user with too few weight days", () => {
    const n = byId({ ...empty, checkins: active, weightDayCount: 0 }).get("nudge-weight")!;
    expect(n.headline).toBe("Log weight to unlock a trend.");
    expect(n.subline).toBe("3 more entries to go.");
    expect(n.accent).toBe("muted");
  });

  it("counts remaining entries and singularises", () => {
    expect(byId({ ...empty, checkins: active, weightDayCount: 2 }).get("nudge-weight")!.subline).toBe(
      "1 more entry to go.",
    );
  });

  it("stops once a weight trend is available", () => {
    expect(byId({ ...empty, checkins: active, weightDayCount: 3 }).has("nudge-weight")).toBe(false);
  });

  it("does not nudge a brand-new user", () => {
    expect(byId({ ...empty, checkins: [checkin(0)], weightDayCount: 0 }).has("nudge-weight")).toBe(false);
  });
});

describe("feed ordering", () => {
  it("orders today's cards before the week's", () => {
    const data: InsightsData = {
      today: TODAY,
      streak: 6,
      checkins: [
        ...[1, 2, 3, 4].map((d) => checkin(d, { sleepHours: 8, energy: 5 })),
        ...[8, 9, 10].map((d) => checkin(d, { sleepHours: 5.5, energy: 2 })),
      ],
      recentHr: [57, 58, 60],
      earlierHr: [58, 59],
      weightDayCount: 0,
      readiness: [readiness(2, 76), readiness(0, 82)],
    };
    expect(computeInsights(data).map((i) => i.id)).toEqual([
      "streak",
      "readiness",
      "sleep",
      "restingHr",
      "energySleep",
      "nudge-weight",
    ]);
  });
});
