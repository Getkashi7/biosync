/**
 * Pure scheduling logic for the daily check-in reminder — no React Native or
 * expo-notifications imports, so it's unit-testable in Node. `reminders.ts`
 * wraps this with the native scheduling calls.
 */

export type ReminderPrefs = {
  /** master on/off */
  enabled: boolean;
  /** the daily nudge time, "HH:MM" 24h */
  time: string;
  /** quiet-hours window (no reminders); may wrap past midnight */
  quietStart: string;
  quietEnd: string;
};

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: false,
  time: "20:00",
  quietStart: "22:00",
  quietEnd: "07:00",
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
export function nextReminderAt(prefs: ReminderPrefs, now: Date, lastCheckinDate: string | null): Date | null {
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
