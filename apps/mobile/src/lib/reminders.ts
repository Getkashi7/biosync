/**
 * Reminder orchestration: wraps expo-notifications around the pure scheduling in
 * `reminderSchedule.ts`. "Smart" = we keep exactly one scheduled notification,
 * the next occurrence, and re-derive it whenever inputs change (app start, app
 * foreground, after a check-in, after settings change) so it skips days already
 * checked in and stays out of quiet hours.
 *
 * Only usable on a dev/native build — expo-notifications doesn't run in Expo Go.
 */
import * as Notifications from "expo-notifications";
import { getLastCheckinDate, getReminderPrefs } from "./prefs";
import { nextReminderAt } from "./reminderSchedule";

const CHANNEL_ID = "check-in-reminders";
let configured = false;

/** Set the foreground handler + Android channel. Idempotent; call once at startup. */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Check-in reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // channel setup is best-effort (no-op off-Android)
  }
}

/** Whether notification permission is already granted (no prompt). */
export async function getReminderPermission(): Promise<boolean> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

/** Prompt for notification permission; returns whether it's now granted. */
export async function requestReminderPermission(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

/**
 * Reconcile the scheduled reminder with current prefs + check-in state: cancel
 * everything, then schedule the single next occurrence (or nothing). Safe to
 * call often; a no-op when reminders are off or permission is missing.
 */
export async function syncReminders(): Promise<void> {
  try {
    const prefs = await getReminderPrefs();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!prefs.enabled) return;
    if (!(await getReminderPermission())) return;
    const next = nextReminderAt(prefs, new Date(), await getLastCheckinDate());
    if (!next) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Time for your check-in",
        body: "Log your sleep, energy and mood to keep your streak going.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: next,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // best-effort — a scheduling hiccup must never crash the app
  }
}
