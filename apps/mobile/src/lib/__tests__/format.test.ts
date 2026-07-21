import { describe, it, expect } from "vitest";
import {
  clockTime,
  dateLabel,
  dayDiff,
  groupThousands,
  initials,
  isoWeekOf,
  monthShort,
  monthYear,
  weekNumber,
} from "../format";

describe("initials", () => {
  it("takes first and last initial", () => {
    expect(initials("Priya Nair")).toBe("PN");
    expect(initials("James Robert Whitfield")).toBe("JW");
  });

  it("handles a single name and stray whitespace", () => {
    expect(initials("kashi")).toBe("K");
    expect(initials("  ada  lovelace  ")).toBe("AL");
  });
});

describe("monthShort / monthYear", () => {
  it("formats the month", () => {
    expect(monthShort(new Date(2026, 6, 20))).toBe("Jul");
    expect(monthYear(new Date(2026, 6, 20))).toBe("Jul 2026");
  });
});

describe("dayDiff", () => {
  it("counts whole days, ignoring clock time", () => {
    expect(dayDiff(new Date(2026, 6, 20, 23), new Date(2026, 6, 20, 1))).toBe(0);
    expect(dayDiff(new Date(2026, 6, 21, 1), new Date(2026, 6, 20, 23))).toBe(1);
    expect(dayDiff(new Date(2026, 6, 20), new Date(2026, 6, 27))).toBe(-7);
  });
});

describe("dateLabel", () => {
  it("formats a date as weekday · month day", () => {
    // 20 July 2026 is a Monday
    expect(dateLabel(new Date(2026, 6, 20))).toBe("Mon · Jul 20");
    expect(dateLabel(new Date(2026, 0, 1))).toBe("Thu · Jan 1");
  });
});

describe("groupThousands", () => {
  it("groups by threes", () => {
    expect(groupThousands(1840)).toBe("1,840");
    expect(groupThousands(999)).toBe("999");
    expect(groupThousands(1000000)).toBe("1,000,000");
  });

  it("rounds before grouping", () => {
    expect(groupThousands(1840.6)).toBe("1,841");
  });

  it("keeps the sign on negatives (calories over target)", () => {
    expect(groupThousands(-360)).toBe("-360");
    expect(groupThousands(-1840)).toBe("-1,840");
  });

  it("handles zero", () => {
    expect(groupThousands(0)).toBe("0");
  });
});

describe("isoWeekOf", () => {
  it("formats as YYYY-Www and matches the API's key", () => {
    expect(isoWeekOf(new Date(2026, 6, 20))).toBe("2026-W30");
    expect(isoWeekOf(new Date(2026, 0, 1))).toBe("2026-W01");
  });

  it("advances a week when a week is added", () => {
    const base = new Date(2026, 6, 20);
    const next = new Date(base);
    next.setDate(next.getDate() + 7);
    expect(isoWeekOf(next)).toBe("2026-W31");
  });
});

describe("weekNumber", () => {
  it("pulls the week out of the key", () => {
    expect(weekNumber("2026-W30")).toBe(30);
    expect(weekNumber("2026-W01")).toBe(1);
  });
});

describe("clockTime", () => {
  it("zero-pads to HH:MM", () => {
    expect(clockTime(new Date(2026, 6, 20, 8, 5))).toBe("08:05");
    expect(clockTime(new Date(2026, 6, 20, 18, 40))).toBe("18:40");
    expect(clockTime(new Date(2026, 6, 20, 0, 0))).toBe("00:00");
  });
});
