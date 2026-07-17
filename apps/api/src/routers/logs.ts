/**
 * Daily-log procedures. Authorization is enforced by `requireRole(USER)` in
 * middleware; resolvers stay thin. Input is validated with the shared Zod
 * schema so the mobile client infers identical types end-to-end.
 */
import { Role } from "@prisma/client";
import { checkinInput, streakInput, logRangeInput, computeStreak } from "@pulse/shared";
import { router, requireRole } from "../trpc";
import { prisma } from "../db";
import { toDbDate, fromDbDate } from "../dbDate";
import { storeReadinessSnapshot } from "../lib/readiness";

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
    // Persist the day's readiness for the Insights trend. Best-effort — the
    // check-in is already saved, and insights.list backfills a missed snapshot.
    try {
      await storeReadinessSnapshot(ctx.user.id, input.date, new Date());
    } catch {
      // swallow — a snapshot hiccup must never fail a successful check-in
    }
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

  /** Check-ins in [from, to] (device-local days), newest first — trends + journal. */
  range: userProcedure.input(logRangeInput).query(async ({ ctx, input }) => {
    const rows = await prisma.dailyLog.findMany({
      where: { userId: ctx.user.id, date: { gte: toDbDate(input.from), lte: toDbDate(input.to) } },
      orderBy: { date: "desc" },
      select: {
        date: true,
        sleepHours: true,
        sleepQuality: true,
        energy: true,
        mood: true,
        weightKg: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      date: fromDbDate(r.date),
      sleepHours: r.sleepHours,
      sleepQuality: r.sleepQuality,
      energy: r.energy,
      mood: r.mood,
      weightKg: r.weightKg,
      // when the check-in was saved (drives the journal's time label)
      createdAt: r.createdAt.toISOString(),
    }));
  }),
});
