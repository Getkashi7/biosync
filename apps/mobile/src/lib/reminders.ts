/**
 * Nudge orchestration: wraps expo-notifications around the pure scheduling in
 * `reminderSchedule.ts`. Everything fires locally on the device — there is no
 * push service in play — so this reconciles the OS's scheduled set with the
 * user's current settings whenever inputs change (app start, foreground, after
 * a check-in, after a settings change).
 *
 * The check-in nudge is "smart": exactly one scheduled occurrence, re-derived
 * so it skips days already logged. The rest are plain daily triggers. A nudge
 * whose time lands inside quiet hours is not scheduled at all.
 *
 * Only usable on a dev/native build — expo-notifications doesn't run in Expo Go.
 */
import * as Notifications from "expo-notifications";
import { getLastCheckinDate, getNotificationPrefs } from "./prefs";
import {
  NUDGE_COPY,
  activeNudges,
  getNudge,
  nextReminderAt,
  parseHm,
  type NudgeType,
} from "./reminderSchedule";

/** One Android channel per nudge, so the OS lets people tune them separately. */
const CHANNELS: Record<NudgeType, { id: string; name: string }> = {
  CHECK_IN: { id: "check-in-reminders", name: "Check-in reminders" },
  MORNING_DIGEST: { id: "morning-digest", name: "Morning digest" },
  SUPPLEMENTS: { id: "supplement-reminders", name: "Supplement reminders" },
  HYDRATION: { id: "hydration-reminders", name: "Hydration reminders" },
  GOALS: { id: "goal-nudges", name: "Goal nudges" },
};

/** Where tapping the notification should land. */
const NUDGE_SCREEN: Partial<Record<NudgeType, string>> = {
  MORNING_DIGEST: "ask",
  SUPPLEMENTS: "supplements",
  GOALS: "goals",
};

let configured = false;

/** Set the foreground handler + Android channels. Idempotent; call once at startup. */
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
    for (const channel of Object.values(CHANNELS)) {
      await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
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
 * Reconcile the OS's scheduled notifications with current settings: cancel
 * everything, then re-schedule whatever should fire. Safe to call often; a
 * no-op when nothing is enabled or permission is missing.
 */
export async function syncReminders(): Promise<void> {
  try {
    const prefs = await getNotificationPrefs();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const active = activeNudges(prefs);
    if (active.length === 0) return;
    if (!(await getReminderPermission())) return;

    const lastCheckin = await getLastCheckinDate();

    for (const nudge of active) {
      const copy = NUDGE_COPY[nudge.type];
      const channelId = CHANNELS[nudge.type].id;
      const screen = NUDGE_SCREEN[nudge.type];
      const content = {
        title: copy.title,
        body: copy.body,
        ...(screen ? { data: { screen } } : {}),
      };

      if (nudge.type === "CHECK_IN") {
        // Smart: a single next occurrence that skips a day already logged.
        const checkin = getNudge(prefs, "CHECK_IN");
        if (checkin.time === null) continue;
        const next = nextReminderAt(
          {
            enabled: true,
            time: checkin.time,
            quietStart: prefs.quietStart,
            quietEnd: prefs.quietEnd,
          },
          new Date(),
          lastCheckin,
        );
        if (next) {
          await Notifications.scheduleNotificationAsync({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: next,
              channelId,
            },
          });
        }
        continue;
      }

      const slot = nudge.time === null ? null : parseHm(nudge.time);
      if (slot === null) continue;
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: Math.floor(slot / 60),
          minute: slot % 60,
          channelId,
        },
      });
    }
  } catch {
    // best-effort — a scheduling hiccup must never crash the app
  }
}
