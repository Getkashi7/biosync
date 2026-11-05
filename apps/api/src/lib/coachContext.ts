/**
 * The data the AI coach is given, and how it is phrased for the model.
 *
 * Split out of the assistant router because that router had a quiet honesty
 * bug. The Ask screen says "I read your last 30 days — sleep, heart, glucose";
 * what the model actually received was the single most recent check-in (with no
 * date on it) plus the latest value per metric, from a 14-day metric window.
 * Asked about her week, the coach answered from one night's sleep and sounded
 * confident doing it. An app that misdescribes what it has looked at is worse
 * than one that admits it has little.
 *
 * So: a real 30-day window, counted in the user's local dates, where every line
 * carries how many days it is based on — the model cannot imply a month of data
 * from four logs if it is told there were four.
 *
 * Two rules hold this file together:
 *
 *  - **It restates, never interprets.** No line says "trending", "high" or
 *    "poor". It reports the user's own figures beside each other and leaves the
 *    reading to the model, which is prompted to stay non-diagnostic. Same
 *    discipline as `nutritionRead` and the §7 suggestion path.
 *  - **It never invents a number.** An empty series prints as absent rather
 *    than as a zero or a NaN, which is why the averages return null instead of
 *    dividing by zero.
 *
 * Nothing here is logged — CLAUDE.md: no health values in any log statement.
 */
import { addDays } from "@pulse/shared";
import { prisma } from "../db";
import { toDbDate, fromDbDate } from "../dbDate";

/** How far back the coach can see. The Ask screen's copy promises this number. */
export const COACH_WINDOW_DAYS = 30;

/** The recent slice each series is summarised over, and the slice before it. */
const RECENT_DAYS = 7;

export type CoachCheckin = {
  date: string;
  sleepHours: number;
  sleepQuality: number;
  energy: number;
  mood: number;
  weightKg: number | null;
};

export type CoachReadiness = { date: string; score: number };

/** One point metric reading, already reduced to the local day it belongs to. */
export type CoachMetric = { type: string; value: number; date: string };

export type CoachContextInput = {
  /** the user's device-local "today" — the day the window ends on */
  today: string;
  windowDays: number;
  checkins: CoachCheckin[];
  readiness: CoachReadiness[];
  metrics: CoachMetric[];
  /**
   * The most recent check-in *before* the window, when there are none inside
   * it. Without this the coach tells a returning user they have never logged
   * anything, which is both wrong and discouraging.
   */
  priorCheckinDate: string | null;
};

/** Label + unit per metric type, matching what the app shows the user. */
const METRIC_UNITS: Record<string, { label: string; unit: string }> = {
  RESTING_HR: { label: "Resting HR", unit: " bpm" },
  HRV: { label: "HRV", unit: " ms" },
  GLUCOSE: { label: "Glucose", unit: " mg/dL" },
  WEIGHT: { label: "Weight", unit: "kg" },
  SLEEP_HOURS: { label: "Sleep (device)", unit: "h" },
  SLEEP_QUALITY: { label: "Sleep quality (device)", unit: "/5" },
  HYDRATION: { label: "Hydration", unit: "ml" },
  ENERGY: { label: "Energy (device)", unit: "/5" },
  MOOD: { label: "Mood (device)", unit: "/5" },
};

/** Round for display without pretending to precision the input didn't have. */
function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Mean of a list, or null when it's empty — never NaN. */
function mean(values: number[], dp = 1): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  return round(total / values.length, dp);
}

/**
 * One series summarised as "latest · last 7 days · the 7 before · whole window",
 * with the sample size on each average so nothing reads as more solid than it
 * is. Returns null when the series has no readings at all.
 *
 * `points` may arrive in any order; it is sorted here so a caller can't make
 * "latest" wrong by passing the wrong order. ISO dates sort lexicographically,
 * which is the one thing YYYY-MM-DD is good for.
 */
function describeSeries(
  name: string,
  points: { date: string; value: number }[],
  unit: string,
  today: string,
  windowDays: number,
  dp = 1,
): string | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const latest = sorted[0]!;

  const recentFrom = addDays(today, -(RECENT_DAYS - 1));
  const priorFrom = addDays(today, -(RECENT_DAYS * 2 - 1));
  const recent = sorted.filter((p) => p.date >= recentFrom).map((p) => p.value);
  const prior = sorted.filter((p) => p.date >= priorFrom && p.date < recentFrom).map((p) => p.value);

  const parts = [`latest ${round(latest.value, dp)}${unit} (${latest.date})`];
  const recentAvg = mean(recent, dp);
  if (recentAvg !== null) {
    parts.push(`last ${RECENT_DAYS} days avg ${recentAvg}${unit} (${recent.length} log${recent.length === 1 ? "" : "s"})`);
  }
  const priorAvg = mean(prior, dp);
  if (priorAvg !== null) {
    parts.push(`the ${RECENT_DAYS} days before avg ${priorAvg}${unit} (${prior.length})`);
  }
  // Only worth a whole-window figure once it covers more than the recent slice.
  if (sorted.length > recent.length) {
    const all = mean(sorted.map((p) => p.value), dp);
    if (all !== null) parts.push(`${windowDays}-day avg ${all}${unit} (${sorted.length})`);
  }
  return `  ${name}: ${parts.join(" · ")}.`;
}

/**
 * Render the window as the plain-text block that goes into the system prompt.
 *
 * Pure, so it can be tested without a database — the formatting *is* the part
 * that has to be right, because this is what the model treats as the truth
 * about someone's body.
 */
export function formatCoachContext(input: CoachContextInput): string {
  const { today, windowDays, checkins, readiness, metrics, priorCheckinDate } = input;
  const lines: string[] = [
    `Window: the ${windowDays} days ending ${today}, in the user's own local dates.`,
  ];

  // ── Check-ins ────────────────────────────────────────────────────────────
  if (checkins.length === 0) {
    lines.push(
      priorCheckinDate
        ? `Check-ins: none in this window. The most recent one before it was ${priorCheckinDate}.`
        : "Check-ins: none logged yet, ever.",
    );
  } else {
    const sorted = [...checkins].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const newest = sorted[0]!;
    lines.push(
      `Check-ins: ${sorted.length} of those ${windowDays} days logged; most recent ${newest.date}.`,
    );
    const series: [string, (c: CoachCheckin) => number | null, string, number][] = [
      ["Sleep", (c) => c.sleepHours, "h", 1],
      ["Sleep quality", (c) => c.sleepQuality, "/5", 1],
      ["Energy", (c) => c.energy, "/5", 1],
      ["Mood", (c) => c.mood, "/5", 1],
      ["Weight", (c) => c.weightKg, "kg", 1],
    ];
    for (const [name, pick, unit, dp] of series) {
      const points = sorted
        .map((c) => ({ date: c.date, value: pick(c) }))
        .filter((p): p is { date: string; value: number } => p.value !== null);
      const line = describeSeries(name, points, unit, today, windowDays, dp);
      if (line) lines.push(line);
    }
  }

  // ── Readiness ────────────────────────────────────────────────────────────
  const readinessLine = describeSeries(
    "Readiness",
    readiness.map((r) => ({ date: r.date, value: r.score })),
    "/100",
    today,
    windowDays,
    0,
  );
  lines.push(readinessLine ? readinessLine.trimStart() : "Readiness: nothing scored in this window.");

  // ── Point metrics ────────────────────────────────────────────────────────
  const byType = new Map<string, { date: string; value: number }[]>();
  for (const m of metrics) {
    const list = byType.get(m.type) ?? [];
    list.push({ date: m.date, value: m.value });
    byType.set(m.type, list);
  }
  if (byType.size === 0) {
    lines.push("Metrics (resting HR, HRV, glucose, hydration, weight): none in this window.");
  } else {
    lines.push("Metrics in this window:");
    // Stable order, so the same data always produces the same prompt.
    for (const type of [...byType.keys()].sort()) {
      const meta = METRIC_UNITS[type] ?? { label: type.toLowerCase(), unit: "" };
      const dp = type === "RESTING_HR" || type === "HRV" || type === "HYDRATION" ? 0 : 1;
      const line = describeSeries(meta.label, byType.get(type)!, meta.unit, today, windowDays, dp);
      if (line) lines.push(line);
    }
  }

  // ── What the coach must not pretend to know ──────────────────────────────
  if (checkins.length === 0 && readiness.length === 0 && byType.size === 0) {
    lines.push(
      "There is nothing in this window to ground an answer in. Say what you'd be able to tell them once they log a few check-ins, and encourage one — do not guess at numbers.",
    );
  } else if (checkins.length > 0 && checkins.length < 4) {
    lines.push(
      `Only ${checkins.length} day${checkins.length === 1 ? "" : "s"} of check-ins here — enough to describe, not enough for a pattern. Don't present it as a trend.`,
    );
  }

  return lines.join("\n");
}

/**
 * Read the window for one user and format it.
 *
 * `today` is the device-local date from the client. It matters: the server runs
 * in UTC, and for a user at UTC+5:30 the first 5½ hours of their day are still
 * "yesterday" in UTC — so a server-side `new Date()` would quietly drop today's
 * check-in from the window it claims to cover. When the client doesn't send one
 * (an older build), UTC is the fallback.
 */
export async function buildCoachContext(userId: string, today?: string): Promise<string> {
  const day = today ?? fromDbDate(new Date());
  const from = addDays(day, -(COACH_WINDOW_DAYS - 1));

  const [checkins, readiness, metrics, prior] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: toDbDate(from), lte: toDbDate(day) } },
      orderBy: { date: "desc" },
      select: { date: true, sleepHours: true, sleepQuality: true, energy: true, mood: true, weightKg: true },
    }),
    prisma.readinessSnapshot.findMany({
      where: { userId, date: { gte: toDbDate(from), lte: toDbDate(day) } },
      orderBy: { date: "desc" },
      select: { date: true, score: true },
    }),
    // No upper bound, matching every other metric read: a reading is stamped
    // when it is taken, and a device slightly ahead of UTC must not lose today's.
    prisma.metric.findMany({
      where: { userId, recordedAt: { gte: toDbDate(from) } },
      orderBy: { recordedAt: "desc" },
      select: { type: true, value: true, recordedAt: true },
      take: 500,
    }),
    prisma.dailyLog.findFirst({
      where: { userId, date: { lt: toDbDate(from) } },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);

  return formatCoachContext({
    today: day,
    windowDays: COACH_WINDOW_DAYS,
    checkins: checkins.map((c) => ({
      date: fromDbDate(c.date),
      sleepHours: c.sleepHours,
      sleepQuality: c.sleepQuality,
      energy: c.energy,
      mood: c.mood,
      weightKg: c.weightKg,
    })),
    readiness: readiness.map((r) => ({ date: fromDbDate(r.date), score: r.score })),
    metrics: metrics.map((m) => ({
      type: m.type,
      value: m.value,
      // A timestamp, not a date column: slice the UTC day it was recorded on.
      date: fromDbDate(m.recordedAt),
    })),
    priorCheckinDate: prior ? fromDbDate(prior.date) : null,
  });
}
