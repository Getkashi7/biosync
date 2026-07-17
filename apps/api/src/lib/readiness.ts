/**
 * Server-side readiness gathering + snapshot persistence. `readiness.today` and
 * the Insights trend both need the same ingredients (a day's check-in plus its
 * resting-HR window), so the DB reads live here once and the pure scoring stays
 * in @pulse/shared.
 *
 * The resting-HR windows are anchored on a `ref` instant — `now` for today (so a
 * stored snapshot matches the live dashboard score exactly), or a past day's end
 * when backfilling history.
 */
import { baselineMean, computeReadiness, type Readiness, type ReadinessInputs } from "@pulse/shared";
import { prisma } from "../db";
import { toDbDate } from "../dbDate";

const DAY_MS = 24 * 60 * 60 * 1000;
/** trailing window the resting-HR baseline is averaged over */
const BASELINE_DAYS = 14;

/**
 * Gather the readiness inputs for one device-local day: that day's check-in, the
 * latest resting-HR reading in the 24h before `ref`, and the 14-day HR baseline
 * before that.
 */
export async function gatherReadinessInputs(userId: string, localDate: string, ref: Date): Promise<ReadinessInputs> {
  const dayAgo = new Date(ref.getTime() - DAY_MS);
  const baselineStart = new Date(ref.getTime() - BASELINE_DAYS * DAY_MS);

  const [log, latestHr, baselineRows] = await Promise.all([
    prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date: toDbDate(localDate) } },
    }),
    prisma.metric.findFirst({
      where: { userId, type: "RESTING_HR", recordedAt: { gte: dayAgo, lte: ref } },
      orderBy: { recordedAt: "desc" },
      select: { value: true },
    }),
    prisma.metric.findMany({
      where: { userId, type: "RESTING_HR", recordedAt: { gte: baselineStart, lt: dayAgo } },
      select: { value: true },
    }),
  ]);

  return {
    sleepHours: log?.sleepHours ?? null,
    sleepQuality: log?.sleepQuality ?? null,
    energy: log?.energy ?? null,
    mood: log?.mood ?? null,
    restingHr: latestHr?.value ?? null,
    restingHrBaseline: baselineMean(baselineRows.map((r) => r.value)),
  };
}

/** Readiness for one device-local day. */
export async function computeReadinessForDate(userId: string, localDate: string, ref: Date): Promise<Readiness> {
  return computeReadiness(await gatherReadinessInputs(userId, localDate, ref));
}

/**
 * Compute and persist the readiness snapshot for a device-local day; returns the
 * stored score, or null when the day has nothing logged (nothing is written).
 */
export async function storeReadinessSnapshot(userId: string, localDate: string, ref: Date): Promise<number | null> {
  const { score } = await computeReadinessForDate(userId, localDate, ref);
  if (score === null) return null;
  const date = toDbDate(localDate);
  await prisma.readinessSnapshot.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, score },
    update: { score },
  });
  return score;
}
