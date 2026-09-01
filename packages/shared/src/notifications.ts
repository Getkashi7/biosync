/**
 * Shared validation for notification settings (§12).
 *
 * The device still does the scheduling — expo-notifications fires everything
 * locally, so nothing here talks to a push service. What the server owns is the
 * user's *preferences*, so they survive a reinstall or a new phone, and so the
 * appointment nudges that arrive with booking (§6/§7) have somewhere to live.
 *
 * Times are "HH:MM" in the user's own device-local clock, never UTC: a nudge at
 * 08:00 means eight in the morning wherever they wake up, and storing an instant
 * would silently drift when they travel.
 */
import { z } from "zod";

/**
 * The nudges that have something real behind them today. Appointment nudges are
 * deliberately absent until booking exists — offering a toggle that can never
 * fire would be a lie.
 */
export const NUDGE_TYPES = [
  "CHECK_IN",
  "MORNING_DIGEST",
  "SUPPLEMENTS",
  "HYDRATION",
  "GOALS",
] as const;

export const nudgeType = z.enum(NUDGE_TYPES);
export type NudgeType = z.infer<typeof nudgeType>;

/** "HH:MM", 24-hour, zero-padded. */
export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a 24-hour HH:MM time");

/**
 * One nudge's settings. `time` is null for a nudge the user hasn't timed yet;
 * a nudge that is enabled must have one (see `nudgeSettingInput`).
 */
export const nudgeSetting = z.object({
  type: nudgeType,
  enabled: z.boolean(),
  time: hhmm.nullable(),
});
export type NudgeSetting = z.infer<typeof nudgeSetting>;

/**
 * An enabled nudge needs a time — without one there is nothing to schedule, and
 * a toggle that silently never fires is worse than an off toggle.
 */
export const nudgeSettingInput = nudgeSetting.refine(
  (n) => !n.enabled || n.time !== null,
  { message: "An enabled nudge needs a time", path: ["time"] },
);

/** Quiet hours + the full set of nudges — the whole settings screen in one shape. */
export const notificationPrefsInput = z.object({
  quietStart: hhmm,
  quietEnd: hhmm,
  nudges: z.array(nudgeSettingInput).max(NUDGE_TYPES.length),
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsInput>;

export type NotificationPrefs = {
  quietStart: string;
  quietEnd: string;
  nudges: NudgeSetting[];
};

/** What a user gets before they've touched the screen: nothing on, sane times. */
export const DEFAULT_QUIET_START = "22:00";
export const DEFAULT_QUIET_END = "07:00";

const DEFAULT_TIMES: Record<NudgeType, string> = {
  CHECK_IN: "20:00",
  MORNING_DIGEST: "08:00",
  SUPPLEMENTS: "09:00",
  HYDRATION: "14:00",
  GOALS: "18:00",
};

export function defaultNotificationPrefs(): NotificationPrefs {
  return {
    quietStart: DEFAULT_QUIET_START,
    quietEnd: DEFAULT_QUIET_END,
    nudges: NUDGE_TYPES.map((type) => ({
      type,
      enabled: false,
      time: DEFAULT_TIMES[type],
    })),
  };
}

/** Parse "HH:MM" → minutes since midnight, or null when malformed. */
export function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Is `minutes` (since midnight) inside the quiet window? The window may wrap
 * past midnight (22:00–07:00 is the default), which is why this isn't a plain
 * range check. A zero-length window (start === end) means "no quiet hours"
 * rather than "silent all day" — the latter would mute the app completely from
 * a single mis-tap.
 */
export function isInQuietHours(minutes: number, quietStart: string, quietEnd: string): boolean {
  const s = parseHm(quietStart);
  const e = parseHm(quietEnd);
  if (s === null || e === null || s === e) return false;
  if (s > e) return minutes >= s || minutes < e;
  return minutes >= s && minutes < e;
}

/**
 * The nudges that will actually fire: enabled, timed, and outside quiet hours.
 * The settings screen uses this to warn about a toggle that looks on but is
 * silenced by the quiet window.
 */
export function activeNudges(prefs: NotificationPrefs): NudgeSetting[] {
  return prefs.nudges.filter((n) => {
    if (!n.enabled || n.time === null) return false;
    const slot = parseHm(n.time);
    if (slot === null) return false;
    return !isInQuietHours(slot, prefs.quietStart, prefs.quietEnd);
  });
}

/**
 * Merge stored rows over the defaults, so a user who has never saved — or who
 * saved before a nudge type existed — still gets a complete, ordered list.
 */
export function mergeNudges(stored: NudgeSetting[]): NudgeSetting[] {
  const byType = new Map(stored.map((n) => [n.type, n]));
  return defaultNotificationPrefs().nudges.map((d) => byType.get(d.type) ?? d);
}
