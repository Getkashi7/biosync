import { describe, expect, it } from "vitest";
import {
  NUDGE_TYPES,
  activeNudges,
  defaultNotificationPrefs,
  hhmm,
  isInQuietHours,
  mergeNudges,
  notificationPrefsInput,
  nudgeSettingInput,
  parseHm,
  type NudgeSetting,
} from "../notifications";

describe("hhmm", () => {
  it("accepts zero-padded 24-hour times", () => {
    for (const t of ["00:00", "07:05", "13:30", "23:59"]) {
      expect(hhmm.safeParse(t).success).toBe(true);
    }
  });

  it("rejects out-of-range, unpadded, and 12-hour forms", () => {
    for (const t of ["24:00", "23:60", "7:05", "8pm", "", "0700"]) {
      expect(hhmm.safeParse(t).success).toBe(false);
    }
  });
});

describe("nudgeSettingInput", () => {
  it("rejects an enabled nudge with no time", () => {
    const r = nudgeSettingInput.safeParse({ type: "CHECK_IN", enabled: true, time: null });
    expect(r.success).toBe(false);
  });

  it("allows a disabled nudge with no time", () => {
    expect(nudgeSettingInput.safeParse({ type: "CHECK_IN", enabled: false, time: null }).success).toBe(true);
  });

  it("allows an enabled nudge with a time", () => {
    expect(nudgeSettingInput.safeParse({ type: "CHECK_IN", enabled: true, time: "20:00" }).success).toBe(true);
  });
});

describe("notificationPrefsInput", () => {
  it("accepts the defaults round-tripped", () => {
    expect(notificationPrefsInput.safeParse(defaultNotificationPrefs()).success).toBe(true);
  });

  it("rejects a malformed quiet window", () => {
    const bad = { ...defaultNotificationPrefs(), quietStart: "25:00" };
    expect(notificationPrefsInput.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown nudge type", () => {
    const bad = {
      ...defaultNotificationPrefs(),
      nudges: [{ type: "APPOINTMENTS", enabled: true, time: "09:00" }],
    };
    expect(notificationPrefsInput.safeParse(bad).success).toBe(false);
  });
});

describe("isInQuietHours", () => {
  it("handles a window that wraps past midnight", () => {
    // 22:00–07:00
    expect(isInQuietHours(parseHm("23:30")!, "22:00", "07:00")).toBe(true);
    expect(isInQuietHours(parseHm("03:00")!, "22:00", "07:00")).toBe(true);
    expect(isInQuietHours(parseHm("07:00")!, "22:00", "07:00")).toBe(false);
    expect(isInQuietHours(parseHm("12:00")!, "22:00", "07:00")).toBe(false);
  });

  it("handles a same-day window", () => {
    expect(isInQuietHours(parseHm("13:00")!, "12:00", "14:00")).toBe(true);
    expect(isInQuietHours(parseHm("11:00")!, "12:00", "14:00")).toBe(false);
  });

  // A single mis-tap setting start === end must not mute the app all day.
  it("treats a zero-length window as no quiet hours", () => {
    expect(isInQuietHours(parseHm("09:00")!, "09:00", "09:00")).toBe(false);
  });
});

describe("activeNudges", () => {
  const prefs = (nudges: NudgeSetting[]) => ({ quietStart: "22:00", quietEnd: "07:00", nudges });

  it("keeps only enabled, timed nudges outside quiet hours", () => {
    const result = activeNudges(
      prefs([
        { type: "CHECK_IN", enabled: true, time: "20:00" }, // fires
        { type: "HYDRATION", enabled: false, time: "14:00" }, // off
        { type: "GOALS", enabled: true, time: null }, // untimed
        { type: "MORNING_DIGEST", enabled: true, time: "03:00" }, // silenced by quiet hours
      ]),
    );
    expect(result.map((n) => n.type)).toEqual(["CHECK_IN"]);
  });
});

describe("mergeNudges", () => {
  it("fills in nudge types the stored rows don't cover", () => {
    const merged = mergeNudges([{ type: "CHECK_IN", enabled: true, time: "21:00" }]);
    expect(merged).toHaveLength(NUDGE_TYPES.length);
    expect(merged.find((n) => n.type === "CHECK_IN")).toEqual({
      type: "CHECK_IN",
      enabled: true,
      time: "21:00",
    });
    // an untouched type falls back to its default, switched off
    expect(merged.find((n) => n.type === "HYDRATION")?.enabled).toBe(false);
  });

  it("returns nudges in a stable declared order", () => {
    const merged = mergeNudges([{ type: "GOALS", enabled: true, time: "18:00" }]);
    expect(merged.map((n) => n.type)).toEqual([...NUDGE_TYPES]);
  });
});
