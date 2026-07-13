import { describe, it, expect } from "vitest";
import { computeStreak, prevDay } from "../streak";

describe("prevDay", () => {
  it("steps back one calendar day", () => {
    expect(prevDay("2026-07-12")).toBe("2026-07-11");
  });

  it("crosses a month boundary", () => {
    expect(prevDay("2026-03-01")).toBe("2026-02-28");
  });

  it("crosses a leap-day boundary", () => {
    expect(prevDay("2024-03-01")).toBe("2024-02-29");
  });

  it("crosses a year boundary", () => {
    expect(prevDay("2026-01-01")).toBe("2025-12-31");
  });

  it("is stable across a spring-forward DST date (UTC math)", () => {
    // US DST begins 2026-03-08; UTC-based math must still yield the prior day.
    expect(prevDay("2026-03-08")).toBe("2026-03-07");
  });
});

describe("computeStreak", () => {
  const today = "2026-07-12";

  it("is 0 with no check-ins", () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it("counts a single check-in today", () => {
    expect(computeStreak([today], today)).toBe(1);
  });

  it("increments across consecutive days ending today", () => {
    const dates = ["2026-07-10", "2026-07-11", "2026-07-12"];
    expect(computeStreak(dates, today)).toBe(3);
  });

  it("resets to the run ending today after an earlier gap", () => {
    // 07-08 is isolated by a missing 07-09; only 10/11/12 count.
    const dates = ["2026-07-08", "2026-07-10", "2026-07-11", "2026-07-12"];
    expect(computeStreak(dates, today)).toBe(3);
  });

  it("gives a one-day grace when today isn't logged yet", () => {
    const dates = ["2026-07-10", "2026-07-11"]; // through yesterday
    expect(computeStreak(dates, today)).toBe(2);
  });

  it("is 0 when neither today nor yesterday is logged (streak broken)", () => {
    const dates = ["2026-07-09", "2026-07-10"]; // ended two days ago
    expect(computeStreak(dates, today)).toBe(0);
  });

  it("ignores future-dated entries", () => {
    const dates = ["2026-07-13", "2026-07-12", "2026-07-11"];
    expect(computeStreak(dates, today)).toBe(2);
  });

  it("counts a streak that spans a month boundary", () => {
    const dates = ["2026-02-27", "2026-02-28", "2026-03-01"];
    expect(computeStreak(dates, "2026-03-01")).toBe(3);
  });

  it("de-duplicates repeated dates", () => {
    const dates = ["2026-07-12", "2026-07-12", "2026-07-11"];
    expect(computeStreak(dates, today)).toBe(2);
  });

  it("accepts a Set as input", () => {
    const dates = new Set(["2026-07-11", "2026-07-12"]);
    expect(computeStreak(dates, today)).toBe(2);
  });
});
