/**
 * §6 display helpers.
 *
 * These mirror day arithmetic from `packages/shared/src/fitness.ts` and the
 * class states from `packages/shared/src/gym.ts`, so the mirror needs its own
 * tests — that is the trade CLAUDE.md accepts for mobile not importing shared.
 *
 * The assertion that carries the most weight is the last one: an unrecognised
 * state must never read as bookable. A newer server introducing a state this
 * build has not heard of should make the card say "unavailable", not offer a
 * button that fails at the moment of use.
 */
import { describe, it, expect } from "vitest";
import {
  classRange,
  classTime,
  dayHeading,
  daysAgo,
  groupByDay,
  localDay,
  seatsLabel,
  unbookableReason,
  type ClassState,
} from "../gymFormat";

/** Local time, so these read the same way the device does. */
const at = (y: number, m: number, d: number, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm);

describe("localDay / daysAgo", () => {
  it("formats a local date, zero-padded", () => {
    expect(localDay(at(2026, 9, 6))).toBe("2026-09-06");
  });

  it("steps back across a month boundary", () => {
    expect(daysAgo(1, "2026-09-01")).toBe("2026-08-31");
    expect(daysAgo(30, "2026-09-16")).toBe("2026-08-17");
    expect(daysAgo(0, "2026-09-16")).toBe("2026-09-16");
  });

  // 2024 was a leap year; the naive "subtract 24 hours" version gets this wrong
  // in zones with a DST shift in between.
  it("steps back across a leap day", () => {
    expect(daysAgo(1, "2024-03-01")).toBe("2024-02-29");
  });
});

describe("class times", () => {
  it("renders a start and a range", () => {
    const start = at(2026, 9, 16, 18, 0).toISOString();
    expect(classTime(start)).toBe("18:00");
    expect(classRange(start, 45)).toBe("18:00 – 18:45");
  });

  it("does not print garbage for an unparseable date", () => {
    expect(classTime("not a date")).toBe("");
    expect(classRange("not a date", 45)).toBe("");
  });
});

describe("dayHeading", () => {
  const now = at(2026, 9, 16, 12, 0);

  it("names today and tomorrow rather than dating them", () => {
    expect(dayHeading(at(2026, 9, 16, 18, 0).toISOString(), now)).toBe("Today");
    expect(dayHeading(at(2026, 9, 17, 7, 0).toISOString(), now)).toBe("Tomorrow");
  });

  it("dates anything further out", () => {
    expect(dayHeading(at(2026, 9, 18, 7, 0).toISOString(), now)).toBe("Fri 18 Sep");
  });

  // 23:30 today and 00:30 tomorrow are hours apart and different days, and the
  // heading has to say so.
  it("splits on the calendar day, not on elapsed hours", () => {
    expect(dayHeading(at(2026, 9, 16, 23, 30).toISOString(), now)).toBe("Today");
    expect(dayHeading(at(2026, 9, 17, 0, 30).toISOString(), now)).toBe("Tomorrow");
  });
});

describe("groupByDay", () => {
  const now = at(2026, 9, 16, 9, 0);
  const row = (h: number, day = 16) => ({ startsAt: at(2026, 9, day, h, 0).toISOString() });

  it("keeps the server's order and starts a group per day", () => {
    const groups = groupByDay([row(7), row(18), row(9, 17)], now);
    expect(groups.map((g) => g.heading)).toEqual(["Today", "Tomorrow"]);
    expect(groups[0]?.rows).toHaveLength(2);
    // Not re-sorted: 07:00 stays before 18:00 because that is how it arrived.
    expect(classTime(groups[0]?.rows[0]?.startsAt ?? "")).toBe("07:00");
  });

  it("returns nothing for nothing", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe("seatsLabel", () => {
  /**
   * Quiet above the threshold. "17 left" on a 20-person class is not something
   * anyone acts on, and printing it on every card turns the one case that
   * matters into background text.
   */
  it("speaks up only when a class is nearly full", () => {
    expect(seatsLabel(17)).toBeNull();
    expect(seatsLabel(6)).toBeNull();
    expect(seatsLabel(5)).toBe("5 left");
    expect(seatsLabel(1)).toBe("1 left");
  });

  it("says Full at zero, and below zero if a counter ever drifts", () => {
    expect(seatsLabel(0)).toBe("Full");
    expect(seatsLabel(-2)).toBe("Full");
  });
});

describe("unbookableReason", () => {
  it("is silent for an open class", () => {
    expect(unbookableReason("OPEN")).toBeNull();
  });

  /**
   * Full and under way are not the same message. One might free up when
   * somebody cancels; the other never will, and a member who is told "full"
   * about a class that started an hour ago will keep checking back.
   */
  it("keeps full, cancelled, running and finished apart", () => {
    expect(unbookableReason("FULL")).toBe("Full");
    expect(unbookableReason("CANCELLED")).toBe("Cancelled");
    expect(unbookableReason("IN_PROGRESS")).toBe("Under way");
    expect(unbookableReason("PAST")).toBe("Finished");
  });

  /**
   * The one that matters most. A state this build does not know about must not
   * fall through to "bookable" — that offers a button which can only fail.
   */
  it("treats an unknown state as unavailable, never as open", () => {
    expect(unbookableReason("WAITLISTED" as ClassState)).toBe("Unavailable");
    expect(unbookableReason("" as ClassState)).toBe("Unavailable");
  });
});
