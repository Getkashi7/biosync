/**
 * Local user preferences, persisted in AsyncStorage: the weight unit (Profile
 * toggle ↔ logging sheets), the daily-reminder settings, and the last check-in
 * date (a local signal the reminder scheduler reads to skip already-logged days).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_REMINDER_PREFS,
  defaultNotificationPrefs,
  mergeNudges,
  migrateLegacyPrefs,
  type NotificationPrefs,
  type ReminderPrefs,
} from "./reminderSchedule";

const UNIT_KEY = "pulse.unitPref";
const REMINDER_KEY = "pulse.reminderPrefs";
const NOTIFICATION_KEY = "pulse.notificationPrefs";
const LAST_CHECKIN_KEY = "pulse.lastCheckinDate";
const INTENT_KEY = "pulse.appIntent";
const WELCOMED_KEY = "pulse.welcomed";

export type WeightUnit = "kg" | "lb";

/**
 * Which door the person came through: their own app, or their practice.
 *
 * This is a UI preference only — it decides which shell to show, never what
 * they're allowed to do. A "professional" intent without a verified capability
 * shows an explanatory screen; it can't grant access. Authorization lives
 * server-side, on the staff capability.
 */
export type AppIntent = "personal" | "professional";

export async function getAppIntent(): Promise<AppIntent> {
  try {
    return (await AsyncStorage.getItem(INTENT_KEY)) === "professional" ? "professional" : "personal";
  } catch {
    return "personal";
  }
}

export async function setAppIntent(intent: AppIntent): Promise<void> {
  try {
    await AsyncStorage.setItem(INTENT_KEY, intent);
  } catch {
    // best-effort — the session still works, it just won't persist the choice
  }
}
/**
 * Whether this person has seen the welcome.
 *
 * Local rather than server-side on purpose: it's a UI detail, and a failed read
 * defaults to "already welcomed" so a storage hiccup can never trap someone in
 * an onboarding screen they've already dismissed.
 */
export async function hasBeenWelcomed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WELCOMED_KEY)) === "1";
  } catch {
    return true;
  }
}

export async function markWelcomed(): Promise<void> {
  try {
    await AsyncStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    // best-effort — worst case they see the welcome once more
  }
}

export type { ReminderPrefs } from "./reminderSchedule";

export async function getUnitPref(): Promise<WeightUnit> {
  try {
    const stored = await AsyncStorage.getItem(UNIT_KEY);
    return stored === "lb" ? "lb" : "kg";
  } catch {
    return "kg";
  }
}

export async function setUnitPref(unit: WeightUnit): Promise<void> {
  try {
    await AsyncStorage.setItem(UNIT_KEY, unit);
  } catch {
    // best-effort — the toggle still works for the session
  }
}

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_KEY);
    if (!raw) return DEFAULT_REMINDER_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    return { ...DEFAULT_REMINDER_PREFS, ...parsed };
  } catch {
    return DEFAULT_REMINDER_PREFS;
  }
}

export async function setReminderPrefs(prefs: ReminderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort
  }
}

export type { NotificationPrefs, NudgeSetting } from "./reminderSchedule";

/**
 * The device's copy of the notification settings. The server is the source of
 * truth, but the scheduler must work offline and at cold start — before any
 * query resolves — so the last known settings are cached here.
 *
 * On first read after the upgrade there is no v2 entry, so an existing user's
 * single reminder + digest are carried across rather than reset to off.
 */
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
      const base = defaultNotificationPrefs();
      return {
        quietStart: parsed.quietStart ?? base.quietStart,
        quietEnd: parsed.quietEnd ?? base.quietEnd,
        nudges: mergeNudges(parsed.nudges ?? []),
      };
    }
    const legacy = await AsyncStorage.getItem(REMINDER_KEY);
    return migrateLegacyPrefs(legacy ? (JSON.parse(legacy) as Partial<ReminderPrefs>) : null);
  } catch {
    return defaultNotificationPrefs();
  }
}

export async function setNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort — the settings still apply for this session
  }
}

/** The device-local day (YYYY-MM-DD) of the user's most recent check-in, if any. */
export async function getLastCheckinDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_CHECKIN_KEY);
  } catch {
    return null;
  }
}

export async function setLastCheckinDate(date: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_CHECKIN_KEY, date);
  } catch {
    // best-effort
  }
}
