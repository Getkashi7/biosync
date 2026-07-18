/**
 * Local user preferences, persisted in AsyncStorage: the weight unit (Profile
 * toggle ↔ logging sheets), the daily-reminder settings, and the last check-in
 * date (a local signal the reminder scheduler reads to skip already-logged days).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_REMINDER_PREFS, type ReminderPrefs } from "./reminderSchedule";

const UNIT_KEY = "pulse.unitPref";
const REMINDER_KEY = "pulse.reminderPrefs";
const LAST_CHECKIN_KEY = "pulse.lastCheckinDate";

export type WeightUnit = "kg" | "lb";
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
