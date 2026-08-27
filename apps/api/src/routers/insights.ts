/**
 * Insights procedure. Gathers the trailing-window ingredients — streak,
 * check-ins, resting-HR + weight readings, and stored readiness snapshots — and
 * hands them to the pure `computeInsights` in @pulse/shared, which turns them
 * into the ordered feed of plain-language cards.
 *
 * Readiness history comes from the persisted `ReadinessSnapshot` table (written
 * on each check-in). The recent days in the trend window are backfilled here for
 * any check-in that predates the snapshot, so the trend lights up from existing
 * data too; the upserts are idempotent and bounded to `TREND_DAYS`.
 */

import { insightsInput, computeInsights, computeStreak, type CheckinPoint, type ReadinessPoint } from "@pulse/shared";
import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";
import { toDbDate, fromDbDate } from "../dbDate";
import { storeReadinessSnapshot } from "../lib/readiness";

const userProcedure = ownerProcedure;

const DAY_MS = 24 * 60 * 60 * 1000;
/** trailing window the week-over-week + correlation cards look at */
const WINDOW_DAYS = 14;
/** how many recent days (incl. today) the readiness trend spans + backfills */
const TREND_DAYS = 4;

/** Shift a device-local YYYY-MM-DD by whole days (UTC-noon-free). */
function shiftDay(date: string, deltaDays: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!) + deltaDays * DAY_MS);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** UTC-day string of an instant — a good-enough local day for the weight nudge. */
function utcDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export const insightsRouter = router({
  /** The read-only insight feed for the caller's device-local today. */
  list: userProcedure.input(insightsInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const today = input.today;
    const now = new Date();
    const windowFrom = shiftDay(today, -(WINDOW_DAYS - 1));
    const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

    const [allDates, windowLogs, hrRows, weightRows, snapRows] = await Promise.all([
      // streak needs every check-in date, not just the window's.
      prisma.dailyLog.findMany({ where: { userId }, select: { date: true } }),
      prisma.dailyLog.findMany({
        where: { userId, date: { gte: toDbDate(windowFrom), lte: toDbDate(today) } },
        select: { date: true, sleepHours: true, sleepQuality: true, energy: true, mood: true, weightKg: true },
      }),
      prisma.metric.findMany({
        where: { userId, type: "RESTING_HR", recordedAt: { gte: windowStart, lte: now } },
        select: { value: true, recordedAt: true },
      }),
      prisma.metric.findMany({
        where: { userId, type: "WEIGHT", recordedAt: { gte: windowStart, lte: now } },
        select: { recordedAt: true },
      }),
      prisma.readinessSnapshot.findMany({
        where: { userId, date: { gte: toDbDate(shiftDay(today, -(TREND_DAYS + 3))), lte: toDbDate(today) } },
        select: { date: true, score: true },
      }),
    ]);

    const streak = computeStreak(
      allDates.map((r) => fromDbDate(r.date)),
      today,
    );

    const checkins: CheckinPoint[] = windowLogs.map((r) => ({
      date: fromDbDate(r.date),
      sleepHours: r.sleepHours,
      sleepQuality: r.sleepQuality,
      energy: r.energy,
      mood: r.mood,
      weightKg: r.weightKg,
    }));

    // Resting HR split into the last 7 days vs the 7 before that (UTC windows,
    // like the trend cards) so the card can read steady / rising / falling.
    const sevenAgo = now.getTime() - 7 * DAY_MS;
    const recentHr: number[] = [];
    const earlierHr: number[] = [];
    for (const r of hrRows) (r.recordedAt.getTime() >= sevenAgo ? recentHr : earlierHr).push(r.value);

    // Distinct days with any weight value (a check-in weight or a WEIGHT metric).
    const weightDays = new Set<string>();
    for (const c of checkins) if (c.weightKg !== null) weightDays.add(c.date);
    for (const r of weightRows) weightDays.add(utcDay(r.recordedAt));

    // Backfill recent readiness snapshots for check-in days that predate the
    // snapshot feature, so the trend works from existing data.
    const snapByDate = new Map(snapRows.map((s) => [fromDbDate(s.date), s.score] as const));
    const checkinDates = new Set(checkins.map((c) => c.date));
    const backfillPromises: Promise<boolean>[] = [];
    for (let i = 0; i < TREND_DAYS; i++) {
      const day = shiftDay(today, -i);
      if (!checkinDates.has(day) || snapByDate.has(day)) continue;
      const ref = i === 0 ? now : new Date(toDbDate(day).getTime() + DAY_MS);
      backfillPromises.push(
        storeReadinessSnapshot(userId, day, ref).then((score) => {
          if (score !== null) snapByDate.set(day, score);
          return score !== null;
        }),
      );
    }
    await Promise.all(backfillPromises);
    const readiness: ReadinessPoint[] = [...snapByDate].map(([date, score]) => ({ date, score }));

    const insights = computeInsights({
      today,
      streak,
      checkins,
      recentHr,
      earlierHr,
      weightDayCount: weightDays.size,
      readiness,
    });

    return { streak, insights };
  }),
});
