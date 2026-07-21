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
import { nextReminderAt, parseHm } from "./reminderSchedule";

const CHANNEL_ID = "check-in-reminders";
const DIGEST_CHANNEL_ID = "morning-digest";
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
    await Notifications.setNotificationChannelAsync(DIGEST_CHANNEL_ID, {
      name: "Morning digest",
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
 * Reconcile both scheduled notifications with current prefs: cancel everything,
 * then re-schedule whichever are enabled. The check-in reminder is a single
 * "smart" next occurrence (skips days already logged, dodges quiet hours); the
 * morning digest is a plain daily trigger at its time. Safe to call often; a
 * no-op when both are off or permission is missing.
 */
export async function syncReminders(): Promise<void> {
  try {
    const prefs = await getReminderPrefs();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!prefs.enabled && !prefs.digestEnabled) return;
    if (!(await getReminderPermission())) return;

    if (prefs.enabled) {
      const next = nextReminderAt(prefs, new Date(), await getLastCheckinDate());
      if (next) {
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
      }
    }

    if (prefs.digestEnabled) {
      const slot = parseHm(prefs.digestTime);
      if (slot !== null) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Your morning digest is ready",
            body: "A quick read on last night — open Ask to see it.",
            data: { screen: "ask" },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: Math.floor(slot / 60),
            minute: slot % 60,
            channelId: DIGEST_CHANNEL_ID,
          },
        });
      }
    }
  } catch {
    // best-effort — a scheduling hiccup must never crash the app
  }
}
