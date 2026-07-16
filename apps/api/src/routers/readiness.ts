/**
 * Readiness procedures. This router only gathers the formula's ingredients —
 * today's check-in plus resting-HR readings — and hands them to the pure
 * `computeReadiness` in @pulse/shared, so the scoring logic stays testable
 * without a database.
 */
import { Role } from "@prisma/client";
import { readinessInput, computeReadiness, baselineMean } from "@pulse/shared";
import { router, requireRole } from "../trpc";
import { prisma } from "../db";
import { toDbDate } from "../dbDate";

const userProcedure = requireRole(Role.USER);

const DAY_MS = 24 * 60 * 60 * 1000;
/** trailing window the resting-HR baseline is averaged over */
const BASELINE_DAYS = 14;

export const readinessRouter = router({
  /** Today's 0–100 score with its component breakdown and confidence flag. */
  today: userProcedure.input(readinessInput).query(async ({ ctx, input }) => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const baselineStart = new Date(now.getTime() - BASELINE_DAYS * DAY_MS);

    // Metric windows are plain UTC timestamps ("last 24h", "the 13 days before
    // that"), so no timezone math; only the check-in lookup needs the client's
    // device-local day.
    const [log, latestHr, baselineRows] = await Promise.all([
      prisma.dailyLog.findUnique({
        where: { userId_date: { userId: ctx.user.id, date: toDbDate(input.today) } },
      }),
      prisma.metric.findFirst({
        where: { userId: ctx.user.id, type: "RESTING_HR", recordedAt: { gte: dayAgo, lte: now } },
        orderBy: { recordedAt: "desc" },
        select: { value: true },
      }),
      prisma.metric.findMany({
        where: {
          userId: ctx.user.id,
          type: "RESTING_HR",
          recordedAt: { gte: baselineStart, lt: dayAgo },
        },
        select: { value: true },
      }),
    ]);

    return computeReadiness({
      sleepHours: log?.sleepHours ?? null,
      sleepQuality: log?.sleepQuality ?? null,
      energy: log?.energy ?? null,
      mood: log?.mood ?? null,
      restingHr: latestHr?.value ?? null,
      restingHrBaseline: baselineMean(baselineRows.map((r) => r.value)),
    });
  }),
});
