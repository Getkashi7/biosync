/**
 * Pure reminder-schedule tests (no React Native / expo-notifications). Covers the
 * "smart" next-occurrence logic plus the time/quiet-hours helpers.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_REMINDER_PREFS,
  NUDGE_TYPES,
  activeNudges,
  defaultNotificationPrefs,
  formatHm,
  getNudge,
  isInQuietHours,
  isNudgeSilenced,
  mergeNudges,
  migrateLegacyPrefs,
  nextReminderAt,
  parseHm,
  type ReminderPrefs,
} from "../reminderSchedule";

const on = (over: Partial<ReminderPrefs> = {}): ReminderPrefs => ({
  ...DEFAULT_REMINDER_PREFS,
  enabled: true,
  ...over,
});

/** July 17 2026 (a Friday) at HH:MM local. */
const at = (h: number, m = 0): Date => new Date(2026, 6, 17, h, m, 0, 0);

describe("parseHm", () => {
  it("parses HH:MM to minutes", () => {
    expect(parseHm("20:00")).toBe(1200);
    expect(parseHm("07:30")).toBe(450);
    expect(parseHm("00:00")).toBe(0);
  });

  it("rejects out-of-range and malformed", () => {
    expect(parseHm("24:00")).toBeNull();
    expect(parseHm("10:60")).toBeNull();
    expect(parseHm("9:5")).toBeNull();
    expect(parseHm("nope")).toBeNull();
  });
});

describe("formatHm", () => {
  it("renders 12-hour clock", () => {
    expect(formatHm("20:00")).toBe("8:00 PM");
    expect(formatHm("00:30")).toBe("12:30 AM");
    expect(formatHm("12:00")).toBe("12:00 PM");
    expect(formatHm("07:05")).toBe("7:05 AM");
  });
});

describe("isInQuietHours", () => {
  it("handles a midnight-wrapping window (22:00–07:00)", () => {
    expect(isInQuietHours(parseHm("23:30")!, "22:00", "07:00")).toBe(true);
    expect(isInQuietHours(parseHm("06:00")!, "22:00", "07:00")).toBe(true);
    expect(isInQuietHours(parseHm("07:00")!, "22:00", "07:00")).toBe(false);
    expect(isInQuietHours(parseHm("12:00")!, "22:00", "07:00")).toBe(false);
  });

  it("handles a same-day window (12:00–14:00)", () => {
    expect(isInQuietHours(parseHm("13:00")!, "12:00", "14:00")).toBe(true);
    expect(isInQuietHours(parseHm("11:00")!, "12:00", "14:00")).toBe(false);
  });

  it("is false when start equals end", () => {
    expect(isInQuietHours(600, "10:00", "10:00")).toBe(false);
  });
});

describe("DEFAULT_REMINDER_PREFS", () => {
  it("ships the morning digest off, at 08:00 by default", () => {
    expect(DEFAULT_REMINDER_PREFS.digestEnabled).toBe(false);
    expect(DEFAULT_REMINDER_PREFS.digestTime).toBe("08:00");
  });
});

describe("nextReminderAt", () => {
  it("returns null when disabled", () => {
    expect(nextReminderAt(on({ enabled: false }), at(12), null)).toBeNull();
  });

  it("uses today's slot when it's still ahead", () => {
    const r = nextReminderAt(on({ time: "20:00" }), at(12), null);
    expect(r).not.toBeNull();
    expect(r!.getDate()).toBe(17);
    expect(r!.getHours()).toBe(20);
    expect(r!.getMinutes()).toBe(0);
  });

  it("rolls to tomorrow when the slot has already passed", () => {
    const r = nextReminderAt(on({ time: "08:00" }), at(12), null);
    expect(r!.getDate()).toBe(18);
    expect(r!.getHours()).toBe(8);
  });

  it("skips today when already checked in today", () => {
    const r = nextReminderAt(on({ time: "20:00" }), at(12), "2026-07-17");
    expect(r!.getDate()).toBe(18);
    expect(r!.getHours()).toBe(20);
  });

  it("suppresses a reminder time inside quiet hours", () => {
    const r = nextReminderAt(on({ time: "23:00", quietStart: "22:00", quietEnd: "07:00" }), at(12), null);
    expect(r).toBeNull();
  });

  it("returns null for a malformed time", () => {
    expect(nextReminderAt(on({ time: "8pm" }), at(12), null)).toBeNull();
  });
});

describe("migrateLegacyPrefs", () => {
  it("carries an existing reminder + digest across to the nudge model", () => {
    const migrated = migrateLegacyPrefs({
      enabled: true,
      time: "21:30",
      quietStart: "23:00",
      quietEnd: "06:00",
      digestEnabled: true,
      digestTime: "07:15",
    });
    expect(migrated.quietStart).toBe("23:00");
    expect(migrated.quietEnd).toBe("06:00");
    expect(getNudge(migrated, "CHECK_IN")).toEqual({ type: "CHECK_IN", enabled: true, time: "21:30" });
    expect(getNudge(migrated, "MORNING_DIGEST")).toEqual({
      type: "MORNING_DIGEST",
      enabled: true,
      time: "07:15",
    });
  });

  it("leaves the new nudge types off for an upgrading user", () => {
    const migrated = migrateLegacyPrefs({ enabled: true, time: "20:00" });
    for (const type of ["SUPPLEMENTS", "HYDRATION", "GOALS"] as const) {
      expect(getNudge(migrated, type).enabled).toBe(false);
    }
  });

  it("falls back to defaults when there is nothing stored", () => {
    expect(migrateLegacyPrefs(null)).toEqual(defaultNotificationPrefs());
  });
});

describe("mergeNudges", () => {
  it("fills in types the stored rows don't cover, in declared order", () => {
    const merged = mergeNudges([{ type: "HYDRATION", enabled: true, time: "12:00" }]);
    expect(merged.map((n) => n.type)).toEqual([...NUDGE_TYPES]);
    expect(merged.find((n) => n.type === "HYDRATION")?.enabled).toBe(true);
    expect(merged.find((n) => n.type === "CHECK_IN")?.enabled).toBe(false);
  });
});

describe("isNudgeSilenced / activeNudges", () => {
  const prefs = {
    quietStart: "22:00",
    quietEnd: "07:00",
    nudges: [
      { type: "CHECK_IN" as const, enabled: true, time: "20:00" },
      { type: "MORNING_DIGEST" as const, enabled: true, time: "03:00" },
      { type: "SUPPLEMENTS" as const, enabled: false, time: "09:00" },
      { type: "HYDRATION" as const, enabled: true, time: null },
      { type: "GOALS" as const, enabled: true, time: "18:00" },
    ],
  };

  it("flags an enabled nudge that quiet hours will silence", () => {
    expect(isNudgeSilenced(prefs, "MORNING_DIGEST")).toBe(true);
    expect(isNudgeSilenced(prefs, "CHECK_IN")).toBe(false);
  });

  it("does not flag a nudge that is switched off", () => {
    expect(isNudgeSilenced(prefs, "SUPPLEMENTS")).toBe(false);
  });

  it("schedules only the nudges that will actually fire", () => {
    expect(activeNudges(prefs).map((n) => n.type)).toEqual(["CHECK_IN", "GOALS"]);
  });
});
