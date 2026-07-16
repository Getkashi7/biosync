/**
 * Daily-log procedures. Authorization is enforced by `requireRole(USER)` in
 * middleware; resolvers stay thin. Input is validated with the shared Zod
 * schema so the mobile client infers identical types end-to-end.
 */
import { Role } from "@prisma/client";
import { checkinInput, streakInput, computeStreak } from "@pulse/shared";
import { router, requireRole } from "../trpc";
import { prisma } from "../db";
import { toDbDate, fromDbDate } from "../dbDate";

const userProcedure = requireRole(Role.USER);

export const logsRouter = router({
  /** Upsert today's check-in (one row per user per calendar day). */
  checkin: userProcedure.input(checkinInput).mutation(async ({ ctx, input }) => {
    const date = toDbDate(input.date);
    const data = {
      sleepHours: input.sleepHours,
      sleepQuality: input.sleepQuality,
      energy: input.energy,
      mood: input.mood,
      weightKg: input.weightKg ?? null,
    };
    await prisma.dailyLog.upsert({
      where: { userId_date: { userId: ctx.user.id, date } },
      create: { userId: ctx.user.id, date, ...data },
      update: data,
    });
    return { ok: true };
  }),

  /** Current check-in streak, computed in the caller's device timezone. */
  streak: userProcedure.input(streakInput).query(async ({ ctx, input }) => {
    const rows = await prisma.dailyLog.findMany({
      where: { userId: ctx.user.id },
      select: { date: true },
    });
    const dates = rows.map((r) => fromDbDate(r.date));
    return { streak: computeStreak(dates, input.today) };
  }),
});
