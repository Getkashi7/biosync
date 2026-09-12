/**
 * §3 formatting. Small, but the sets/reps line is read mid-session with a
 * heartbeat in your ears — "1 × 1200" for a twenty-minute walk is technically
 * the stored value and completely useless.
 */
import { describe, it, expect } from "vitest";
import { dayLetter, formatSetsReps, weekDots } from "../fitnessFormat";

describe("formatSetsReps", () => {
  it("writes plain rep work as sets × reps", () => {
    expect(formatSetsReps({ sets: 3, reps: 10, hold: false })).toBe("3 × 10");
  });

  it("writes short holds in seconds", () => {
    expect(formatSetsReps({ sets: 3, reps: 40, hold: true })).toBe("3 × 40s");
  });

  it("switches to minutes once seconds stop being readable", () => {
    expect(formatSetsReps({ sets: 1, reps: 1200, hold: true })).toBe("20m");
    expect(formatSetsReps({ sets: 2, reps: 300, hold: true })).toBe("2 × 5m");
  });

  it("drops the set count when there is only one", () => {
    expect(formatSetsReps({ sets: 1, reps: 45, hold: true })).toBe("45s");
    // …but not for rep work, where "10" alone would read as a weight.
    expect(formatSetsReps({ sets: 1, reps: 10, hold: false })).toBe("1 × 10");
  });
});

describe("dayLetter", () => {
  it("letters the week", () => {
    expect(dayLetter("2026-09-07")).toBe("M");
    expect(dayLetter("2026-09-09")).toBe("W");
    expect(dayLetter("2026-09-13")).toBe("S");
  });
});

describe("weekDots", () => {
  const s = (date: string, over = {}) => ({
    date,
    intensity: 50,
    rest: false,
    completed: false,
    ...over,
  });

  it("carries intensity, rest and completion through", () => {
    const out = weekDots([s("2026-09-07"), s("2026-09-08", { rest: true, intensity: 0 })]);
    expect(out[0]).toMatchObject({ label: "M", intensity: 50, rest: false });
    expect(out[1]).toMatchObject({ label: "T", rest: true, intensity: 0 });
  });

  // A spine that always drew seven would imply a plan for days that have none.
  it("draws only the days that exist", () => {
    expect(weekDots([s("2026-09-07")])).toHaveLength(1);
    expect(weekDots([])).toEqual([]);
  });
});
