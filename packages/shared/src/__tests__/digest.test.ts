import { describe, it, expect } from "vitest";
import { computeDigest, type CheckinPoint, type DigestData, type MetricWindow } from "../index";

const TODAY = "2026-07-19";

const EMPTY_WIN: MetricWindow = { recent: [], earlier: [] };

function base(overrides: Partial<DigestData> = {}): DigestData {
  return {
    today: TODAY,
    readiness: [],
    checkins: [],
    hrv: EMPTY_WIN,
    glucose: EMPTY_WIN,
    restingHr: EMPTY_WIN,
    ...overrides,
  };
}

function checkin(date: string, sleepHours: number): CheckinPoint {
  return { date, sleepHours, sleepQuality: 3, energy: 3, mood: 3, weightKg: null };
}

describe("computeDigest", () => {
  it("returns no cards when there is no data", () => {
    const { cards } = computeDigest(base());
    expect(cards).toEqual([]);
  });

  it("builds a sleep card from the most recent logged night", () => {
    const { cards } = computeDigest(
      base({
        checkins: [checkin("2026-07-17", 6.0), checkin("2026-07-18", 6.2), checkin("2026-07-19", 7.5)],
      }),
    );
    const sleep = cards.find((c) => c.family === "sleep");
    expect(sleep).toBeDefined();
    expect(sleep!.value).toBe("7.5");
    expect(sleep!.unit).toBe("h");
    // 7.5h vs mean(6.0, 6.2)=6.1 → +84 min more
    expect(sleep!.reading).toContain("more");
    expect(sleep!.confidence).toBe(3);
  });

  it("reads HRV as up with a percentage when it rises over baseline", () => {
    const { cards } = computeDigest(base({ hrv: { earlier: [50, 50], recent: [52, 60] } }));
    const hrv = cards.find((c) => c.family === "hrv");
    expect(hrv).toBeDefined();
    expect(hrv!.value).toBe("60"); // latest of recent
    expect(hrv!.reading).toContain("Up about");
  });

  it("reads glucose as steady inside the epsilon", () => {
    const { cards } = computeDigest(base({ glucose: { earlier: [98, 100], recent: [99, 101] } }));
    const g = cards.find((c) => c.family === "glucose");
    expect(g!.reading).toBe("Steady against your recent readings.");
    expect(g!.unit).toBe("mg/dL");
  });

  it("marks readiness as the best across the days when the latest is highest", () => {
    const { cards } = computeDigest(
      base({
        readiness: [
          { date: "2026-07-17", score: 70 },
          { date: "2026-07-18", score: 73 },
          { date: "2026-07-19", score: 82 },
        ],
      }),
    );
    const r = cards.find((c) => c.family === "readiness");
    expect(r!.value).toBe("82");
    expect(r!.reading).toContain("best");
  });

  it("caps the digest at three cards in family priority", () => {
    const { cards, greeting } = computeDigest(
      base({
        checkins: [checkin("2026-07-19", 7)],
        hrv: { earlier: [], recent: [60] },
        glucose: { earlier: [], recent: [95] },
        restingHr: { earlier: [], recent: [58] },
        readiness: [{ date: "2026-07-19", score: 80 }],
      }),
    );
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.family)).toEqual(["sleep", "hrv", "glucose"]);
    expect(greeting).toContain("3 things");
  });
});
