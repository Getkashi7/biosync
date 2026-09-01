/**
 * Data layer for notification settings. Kept apart from the sheet so it stays
 * presentation-only.
 *
 * The server is the source of truth (so settings survive a reinstall), but the
 * scheduler reads the local cache — it has to work offline and at cold start,
 * before any query resolves. So every write goes to the device first and then
 * to the server: a save that can't reach the network still takes effect on the
 * phone, which is where the notifications actually fire.
 */
import { trpc } from "../../lib/trpc";
import { getNotificationPrefs, setNotificationPrefs } from "../../lib/prefs";
import { mergeNudges, type NotificationPrefs } from "../../lib/reminderSchedule";

/**
 * Settings to render. Falls back to the device cache when the server can't be
 * reached, so the screen still shows what's actually scheduled rather than a
 * misleading set of defaults.
 */
export async function fetchNotificationPrefs(): Promise<{ prefs: NotificationPrefs; synced: boolean }> {
  const local = await getNotificationPrefs();
  try {
    const remote = await trpc.notifications.get.query();
    const prefs: NotificationPrefs = {
      quietStart: remote.quietStart,
      quietEnd: remote.quietEnd,
      nudges: mergeNudges(remote.nudges),
    };
    await setNotificationPrefs(prefs);
    return { prefs, synced: true };
  } catch {
    return { prefs: local, synced: false };
  }
}

/**
 * Persist settings. Writes the device cache first so scheduling is immediate,
 * then mirrors to the server; returns whether that mirror succeeded so the
 * screen can say so honestly instead of implying a save that didn't happen.
 */
export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<boolean> {
  await setNotificationPrefs(prefs);
  try {
    await trpc.notifications.update.mutate({
      quietStart: prefs.quietStart,
      quietEnd: prefs.quietEnd,
      nudges: prefs.nudges,
    });
    return true;
  } catch {
    return false;
  }
}
