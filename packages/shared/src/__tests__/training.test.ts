import { describe, it, expect } from "vitest";
import { isoWeek, parsePlanItems } from "../index";

describe("parsePlanItems", () => {
  it("parses a well-formed plan", () => {
    const items = [
      { name: "Back squat", sets: 4, reps: 6 },
      { name: "Row", sets: 3, reps: 10 },
    ];
    expect(parsePlanItems(items)).toEqual(items);
  });

  it("returns [] rather than throwing on junk from the JSON column", () => {
    expect(parsePlanItems(null)).toEqual([]);
    expect(parsePlanItems("nope")).toEqual([]);
    expect(parsePlanItems({ name: "not an array" })).toEqual([]);
    expect(parsePlanItems([{ name: "Squat" }])).toEqual([]); // missing sets/reps
  });

  it("rejects the whole plan if any item is out of range", () => {
    expect(parsePlanItems([{ name: "Squat", sets: 4, reps: 6 }, { name: "X", sets: 0, reps: 5 }])).toEqual([]);
  });
});

describe("isoWeek", () => {
  it("formats as YYYY-Www", () => {
    expect(isoWeek(new Date(2026, 6, 20))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("puts a mid-July date in the high-20s weeks", () => {
    expect(isoWeek(new Date(2026, 6, 20))).toBe("2026-W30");
  });

  it("handles the first days of January without rolling the year wrongly", () => {
    // 1 Jan 2026 is a Thursday → ISO week 1 of 2026
    expect(isoWeek(new Date(2026, 0, 1))).toBe("2026-W01");
  });
});
