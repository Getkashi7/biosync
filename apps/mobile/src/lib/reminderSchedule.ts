/**
 * Pure scheduling logic for every nudge — no React Native or expo-notifications
 * imports, so it's unit-testable in Node. `reminders.ts` wraps this with the
 * native scheduling calls.
 *
 * The nudge shapes deliberately mirror `notifications.ts` in @pulse/shared
 * rather than importing it: shared is type-only on mobile (a value import fails
 * under Metro), so the few lines of logic are duplicated here on purpose. Keep
 * the two in step.
 */

/**
 * The legacy single-reminder shape. Still read from storage so an existing
 * user's settings survive the upgrade — see `migrateLegacyPrefs`.
 */
export type ReminderPrefs = {
  /** master on/off (the daily check-in nudge) */
  enabled: boolean;
  /** the daily nudge time, "HH:MM" 24h */
  time: string;
  /** quiet-hours window (no reminders); may wrap past midnight */
  quietStart: string;
  quietEnd: string;
  /** morning digest on/off (a proactive read of last night, fires daily) */
  digestEnabled: boolean;
  /** the morning digest time, "HH:MM" 24h */
  digestTime: string;
};

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: false,
  time: "20:00",
  quietStart: "22:00",
  quietEnd: "07:00",
  digestEnabled: false,
  digestTime: "08:00",
};

/** Parse "HH:MM" → minutes since midnight, or null when malformed. */
export function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** "20:00" → "8:00 PM" (12-hour display). */
export function formatHm(hm: string): string {
  const parts = hm.split(":");
  const h = Number(parts[0] ?? 0);
  const min = parts[1] ?? "00";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:${min} ${h < 12 ? "AM" : "PM"}`;
}

/** Is `minutes` (since midnight) inside the possibly midnight-wrapping quiet window? */
export function isInQuietHours(minutes: number, quietStart: string, quietEnd: string): boolean {
  const s = parseHm(quietStart);
  const e = parseHm(quietEnd);
  if (s === null || e === null || s === e) return false;
  // e.g. 22:00–07:00 wraps midnight
  if (s > e) return minutes >= s || minutes < e;
  return minutes >= s && minutes < e;
}

/** Device-local YYYY-MM-DD for a Date. */
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The next datetime the reminder should fire, or null when it shouldn't be
 * scheduled at all: disabled, a malformed/quiet-hours time, or no valid upcoming
 * slot.
 *
 * "Smart": use today's slot when it's still ahead and today isn't already checked
 * in; otherwise roll to the next day. A day equal to `lastCheckinDate` is skipped
 * so we never nudge someone who already logged that day.
 */
export function nextReminderAt(
  prefs: { enabled: boolean; time: string; quietStart: string; quietEnd: string },
  now: Date,
  lastCheckinDate: string | null,
): Date | null {
  if (!prefs.enabled) return null;
  const slot = parseHm(prefs.time);
  if (slot === null) return null;
  // A reminder time sitting inside quiet hours is suppressed entirely.
  if (isInQuietHours(slot, prefs.quietStart, prefs.quietEnd)) return null;

  const hour = Math.floor(slot / 60);
  const minute = slot % 60;

  for (let offset = 0; offset <= 2; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= now.getTime()) continue; // slot already passed today
    if (localDay(candidate) === lastCheckinDate) continue; // already checked in that day
    return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * §12 — the full nudge set. Mirrors NUDGE_TYPES in @pulse/shared.
 * ------------------------------------------------------------------ */

export const NUDGE_TYPES = [
  "CHECK_IN",
  "MORNING_DIGEST",
  "SUPPLEMENTS",
  "HYDRATION",
  "GOALS",
] as const;

export type NudgeType = (typeof NUDGE_TYPES)[number];

export type NudgeSetting = {
  type: NudgeType;
  enabled: boolean;
  /** "HH:MM" device-local; null when the user hasn't picked a time. */
  time: string | null;
};

export type NotificationPrefs = {
  quietStart: string;
  quietEnd: string;
  nudges: NudgeSetting[];
};

const DEFAULT_TIMES: Record<NudgeType, string> = {
  CHECK_IN: "20:00",
  MORNING_DIGEST: "08:00",
  SUPPLEMENTS: "09:00",
  HYDRATION: "14:00",
  GOALS: "18:00",
};

/** Copy shown on the settings row and in the notification itself. */
export const NUDGE_COPY: Record<NudgeType, { label: string; caption: string; title: string; body: string }> = {
  CHECK_IN: {
    label: "Daily check-in",
    caption: "A nudge to log sleep, energy and mood.",
    title: "Time for your check-in",
    body: "Log your sleep, energy and mood to keep your streak going.",
  },
  MORNING_DIGEST: {
    label: "Morning digest",
    caption: "A short read on your night, each morning in Ask.",
    title: "Your morning digest is ready",
    body: "A quick read on last night — open Ask to see it.",
  },
  SUPPLEMENTS: {
    label: "Supplements",
    caption: "A reminder to take what's in your stack.",
    title: "Supplement time",
    body: "Open your stack to tick off today's doses.",
  },
  HYDRATION: {
    label: "Hydration",
    caption: "A mid-day prompt to log what you've drunk.",
    title: "Topped up?",
    body: "Log your hydration so far today.",
  },
  GOALS: {
    label: "Goals",
    caption: "A look at what you're working toward.",
    title: "How are your goals going?",
    body: "Take a moment to see where you're at.",
  },
};

export function defaultNotificationPrefs(): NotificationPrefs {
  return {
    quietStart: DEFAULT_REMINDER_PREFS.quietStart,
    quietEnd: DEFAULT_REMINDER_PREFS.quietEnd,
    nudges: NUDGE_TYPES.map((type) => ({ type, enabled: false, time: DEFAULT_TIMES[type] })),
  };
}

/**
 * Carry an existing user's single reminder + digest across to the nudge model.
 * They already chose these; an upgrade that silently switched them off would
 * read as the app forgetting.
 */
export function migrateLegacyPrefs(legacy: Partial<ReminderPrefs> | null): NotificationPrefs {
  const base = defaultNotificationPrefs();
  if (!legacy) return base;
  const merged = { ...DEFAULT_REMINDER_PREFS, ...legacy };
  return {
    quietStart: merged.quietStart,
    quietEnd: merged.quietEnd,
    nudges: base.nudges.map((n) => {
      if (n.type === "CHECK_IN") return { ...n, enabled: merged.enabled, time: merged.time };
      if (n.type === "MORNING_DIGEST") {
        return { ...n, enabled: merged.digestEnabled, time: merged.digestTime };
      }
      return n;
    }),
  };
}

/** Merge stored nudges over the defaults, so a missing type still has a row. */
export function mergeNudges(stored: NudgeSetting[]): NudgeSetting[] {
  const byType = new Map(stored.map((n) => [n.type, n]));
  return defaultNotificationPrefs().nudges.map((d) => byType.get(d.type) ?? d);
}

export function getNudge(prefs: NotificationPrefs, type: NudgeType): NudgeSetting {
  return prefs.nudges.find((n) => n.type === type) ?? { type, enabled: false, time: DEFAULT_TIMES[type] };
}

/**
 * A nudge the user switched on that quiet hours will silence anyway. The
 * settings screen surfaces this — a toggle that looks on but never fires is
 * the thing people report as "the app doesn't remind me".
 */
export function isNudgeSilenced(prefs: NotificationPrefs, type: NudgeType): boolean {
  const n = getNudge(prefs, type);
  if (!n.enabled || n.time === null) return false;
  const slot = parseHm(n.time);
  if (slot === null) return false;
  return isInQuietHours(slot, prefs.quietStart, prefs.quietEnd);
}

/** The nudges that will actually fire: enabled, timed, outside quiet hours. */
export function activeNudges(prefs: NotificationPrefs): NudgeSetting[] {
  return prefs.nudges.filter((n) => n.enabled && n.time !== null && !isNudgeSilenced(prefs, n.type));
}
