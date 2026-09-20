/**
 * The mobile copy of the photo grouping/formatting logic. Duplicated from
 * @pulse/shared on purpose (shared is type-only here), so it carries its own
 * tests — the two must agree, especially on ordering.
 */
import { describe, it, expect } from "vitest";
import {
  fullPhotoDate,
  groupPhotosByMonth,
  photoHasOverride,
  photoMonthHeading,
  tilePhotoDate,
  todayIso,
  weeksApart,
} from "../photoFormat";

describe("date formatting", () => {
  it("renders the Doto tile date", () => {
    expect(tilePhotoDate("2026-08-28")).toBe("28 AUG");
    expect(tilePhotoDate("2026-01-01")).toBe("01 JAN");
    expect(tilePhotoDate("2026-12-31")).toBe("31 DEC");
  });

  it("renders the month heading and the long date", () => {
    expect(photoMonthHeading("2026-08-28")).toBe("August 2026");
    expect(fullPhotoDate("2026-08-28")).toBe("28 August 2026");
    expect(fullPhotoDate("2026-08-03")).toBe("3 August 2026");
  });

  it("returns empty string on a malformed date rather than throwing", () => {
    for (const bad of ["", "2026-8-28", "28/08/2026", "2026-13-01"]) {
      expect(tilePhotoDate(bad)).toBe("");
      expect(photoMonthHeading(bad)).toBe("");
    }
  });
});

describe("photoHasOverride", () => {
  // The chip has to mean "this one is different" — drawn on every tile it
  // would say nothing at all.
  it("marks only a photo that differs from the gallery default", () => {
    expect(photoHasOverride("NONE", "TRAINER")).toBe(true);
    expect(photoHasOverride("PRACTITIONER", "TRAINER")).toBe(true);
    expect(photoHasOverride(null, "TRAINER")).toBe(false);
    expect(photoHasOverride("TRAINER", "TRAINER")).toBe(false);
  });

  it("marks nothing when the gallery is private and the photo follows it", () => {
    expect(photoHasOverride(null, "NONE")).toBe(false);
  });
});

describe("groupPhotosByMonth", () => {
  it("orders newest first, within and across months", () => {
    const groups = groupPhotosByMonth([
      { takenOn: "2026-07-04" },
      { takenOn: "2026-08-28" },
      { takenOn: "2026-08-02" },
    ]);
    expect(groups.map((g) => g.heading)).toEqual(["August 2026", "July 2026"]);
    expect(groups[0]?.photos.map((p) => p.takenOn)).toEqual(["2026-08-28", "2026-08-02"]);
  });

  it("keeps months from different years apart", () => {
    const groups = groupPhotosByMonth([{ takenOn: "2025-08-10" }, { takenOn: "2026-08-10" }]);
    expect(groups.map((g) => g.heading)).toEqual(["August 2026", "August 2025"]);
  });

  it("does not mutate its input", () => {
    const input = [{ takenOn: "2026-07-04" }, { takenOn: "2026-08-28" }];
    groupPhotosByMonth(input);
    expect(input.map((p) => p.takenOn)).toEqual(["2026-07-04", "2026-08-28"]);
  });

  it("returns nothing for an empty gallery", () => {
    expect(groupPhotosByMonth([])).toEqual([]);
  });
});

describe("todayIso", () => {
  it("uses the device-local day, not UTC", () => {
    // 00:30 local on the 28th is still the 28th, even though it is the 27th in UTC
    // for a positive offset — a photo taken after midnight belongs to today.
    const local = new Date(2026, 7, 28, 0, 30, 0);
    expect(todayIso(local)).toBe("2026-08-28");
  });

  it("zero-pads month and day", () => {
    expect(todayIso(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });
});

describe("weeksApart", () => {
  it("counts whole weeks between two dates", () => {
    expect(weeksApart("2026-06-12", "2026-08-28")).toBe(11);
    expect(weeksApart("2026-08-21", "2026-08-28")).toBe(1);
    expect(weeksApart("2026-08-28", "2026-08-28")).toBe(0);
  });

  it("does not care which came first", () => {
    expect(weeksApart("2026-08-28", "2026-06-12")).toBe(11);
  });

  /**
   * Rounded, not floored. 76 days is much nearer eleven weeks than ten, and the
   * number sits under the words "weeks apart" where "about" is already implied.
   */
  it("rounds to the nearest week rather than truncating", () => {
    expect(weeksApart("2026-01-01", "2026-01-05")).toBe(1);
    expect(weeksApart("2026-01-01", "2026-01-04")).toBe(0);
  });

  it("returns null for a date it cannot parse, rather than a wrong number", () => {
    expect(weeksApart("", "2026-08-28")).toBeNull();
    expect(weeksApart("not-a-date", "2026-08-28")).toBeNull();
  });
});
