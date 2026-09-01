/**
 * Notification settings (§12). The device does the scheduling — this router
 * only remembers what the user chose, so their nudges survive a reinstall or a
 * new phone, and so appointment nudges have somewhere to live when booking
 * lands (§6/§7).
 *
 * Same shape as the other domain routers: authorization in middleware, shared
 * Zod at the boundary, owner always from the session and never from input.
 */

import { defaultNotificationPrefs, mergeNudges, notificationPrefsInput, type NudgeSetting } from "@pulse/shared";
import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";

const userProcedure = ownerProcedure;

export const notificationsRouter = router({
  /**
   * The user's settings. A user who has never opened the screen has no rows at
   * all, so this returns the shared defaults rather than an empty list — the
   * client should never have to decide what "no preferences" looks like.
   */
  get: userProcedure.query(async ({ ctx }) => {
    const [prefs, nudges] = await Promise.all([
      prisma.notificationPrefs.findUnique({
        where: { userId: ctx.user.id },
        select: { quietStart: true, quietEnd: true },
      }),
      prisma.notificationNudge.findMany({
        where: { userId: ctx.user.id },
        select: { type: true, enabled: true, time: true },
      }),
    ]);

    const defaults = defaultNotificationPrefs();
    return {
      quietStart: prefs?.quietStart ?? defaults.quietStart,
      quietEnd: prefs?.quietEnd ?? defaults.quietEnd,
      nudges: mergeNudges(nudges as NudgeSetting[]),
      /**
       * Whether this user has ever saved settings here.
       *
       * "Never saved" and "saved with everything switched off" look identical
       * once defaults are filled in, but they must not be treated the same: a
       * device that carried settings over from the old single-reminder model
       * would otherwise have them wiped by empty defaults the first time it
       * synced — the app appearing to forget, which is the whole thing the
       * migration exists to avoid.
       */
      stored: prefs !== null || nudges.length > 0,
    };
  }),

  /**
   * Replace the whole settings screen in one call. It's a single transaction
   * because a half-saved screen — quiet hours moved but the nudge that depends
   * on them not — would leave the user with reminders they didn't ask for.
   */
  update: userProcedure.input(notificationPrefsInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    await prisma.$transaction([
      prisma.notificationPrefs.upsert({
        where: { userId },
        create: { userId, quietStart: input.quietStart, quietEnd: input.quietEnd },
        update: { quietStart: input.quietStart, quietEnd: input.quietEnd },
      }),
      ...input.nudges.map((n) =>
        prisma.notificationNudge.upsert({
          where: { userId_type: { userId, type: n.type } },
          create: { userId, type: n.type, enabled: n.enabled, time: n.time },
          update: { enabled: n.enabled, time: n.time },
        }),
      ),
    ]);
    return { ok: true };
  }),
});
