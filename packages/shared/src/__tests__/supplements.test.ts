import { describe, it, expect } from "vitest";
import { buildSchedule, parseSuggestions, suggestionGuard, type StackItem, type TakenTick } from "../index";

const item = (over: Partial<StackItem> = {}): StackItem => ({
  id: "s1",
  name: "Vitamin D",
  dose: "2000 IU",
  timings: ["AM"],
  note: null,
  ...over,
});

describe("buildSchedule", () => {
  it("returns an empty day for an empty stack", () => {
    const day = buildSchedule([], []);
    expect(day.slots).toEqual([]);
    expect(day.due).toBe(0);
    expect(day.taken).toBe(0);
    expect(day.adherence).toBe(0);
  });

  it("drops slots nothing is due in", () => {
    const day = buildSchedule([item({ timings: ["AM"] })], []);
    expect(day.slots.map((s) => s.timing)).toEqual(["AM"]);
  });

  it("keeps the AM → PRE → PM order", () => {
    const day = buildSchedule(
      [item({ id: "a", timings: ["PM"] }), item({ id: "b", timings: ["AM"] }), item({ id: "c", timings: ["PRE"] })],
      [],
    );
    expect(day.slots.map((s) => s.timing)).toEqual(["AM", "PRE", "PM"]);
  });

  it("expands one supplement into each of its timings", () => {
    const day = buildSchedule([item({ timings: ["AM", "PM"] })], []);
    expect(day.due).toBe(2);
    expect(day.slots).toHaveLength(2);
  });

  it("marks only the ticked dose as taken", () => {
    const ticks: TakenTick[] = [{ supplementId: "s1", timing: "AM" }];
    const day = buildSchedule([item({ timings: ["AM", "PM"] })], ticks);
    expect(day.taken).toBe(1);
    expect(day.due).toBe(2);
    expect(day.adherence).toBe(0.5);
    expect(day.slots[0]!.doses[0]!.taken).toBe(true);
    expect(day.slots[1]!.doses[0]!.taken).toBe(false);
  });

  it("ignores a tick for a different supplement", () => {
    const day = buildSchedule([item()], [{ supplementId: "other", timing: "AM" }]);
    expect(day.taken).toBe(0);
  });
});

describe("suggestionGuard", () => {
  it("allows informational phrasing", () => {
    expect(suggestionGuard("Commonly discussed alongside consistently short sleep.")).toBe(true);
  });

  it("blocks prescriptive or medical phrasing", () => {
    expect(suggestionGuard("Take 500mg to treat your deficiency")).toBe(false);
    expect(suggestionGuard("This will cure your disorder")).toBe(false);
    expect(suggestionGuard("Use instead of your medication")).toBe(false);
  });
});

describe("parseSuggestions", () => {
  const ok = {
    suggestions: [
      { name: "Magnesium", rationale: "Often discussed where sleep has been short.", evidence: 3 },
      { name: "Creatine", rationale: "Widely studied for training support.", evidence: 4 },
    ],
  };

  it("parses a well-formed list", () => {
    const s = parseSuggestions(JSON.stringify(ok))!;
    expect(s).toHaveLength(2);
    expect(s[0]!.name).toBe("Magnesium");
    expect(s[0]!.evidence).toBe(3);
  });

  it("returns null for non-JSON", () => {
    expect(parseSuggestions("Here are some ideas:")).toBeNull();
  });

  it("returns null when the shape is wrong", () => {
    expect(parseSuggestions(JSON.stringify({ suggestions: [] }))).toBeNull();
  });

  it("filters out entries that stray into medical advice", () => {
    const mixed = {
      suggestions: [
        { name: "Magnesium", rationale: "Often discussed where sleep has been short.", evidence: 3 },
        { name: "Zinc", rationale: "Take 50mg to treat your deficiency.", evidence: 2 },
      ],
    };
    const s = parseSuggestions(JSON.stringify(mixed))!;
    expect(s).toHaveLength(1);
    expect(s[0]!.name).toBe("Magnesium");
  });

  it("returns null when every entry is unsafe", () => {
    const unsafe = {
      suggestions: [{ name: "Zinc", rationale: "Prescribed to treat your disease.", evidence: 2 }],
    };
    expect(parseSuggestions(JSON.stringify(unsafe))).toBeNull();
  });
});
