/**
 * Insights — plain-language observations derived from a user's own data, for the
 * read-only Insights feed (the Chat tab). Pure logic (like streak.ts and
 * readiness.ts): the API gathers the ingredients, this file turns them into an
 * ordered list of insight cards, so the wording + thresholds are unit-testable
 * without a database.
 *
 * Voice (from the design): observation first, in plain words ("Readiness is
 * trending up."); the number lives in the sub-line. Second person, present
 * tense, no jargon, no exclamation marks. Nudges invite, never warn.
 *
 * A card is emitted only when the data supports it; when nothing qualifies the
 * list is empty and the screen shows its cold-start empty state.
 */
import { z } from "zod";
import { dateStringSchema } from "./checkin";

export const insightsInput = z.object({
  /** the user's device-local "today", so the day buckets are timezone-correct */
  today: dateStringSchema,
});

export type InsightsInput = z.infer<typeof insightsInput>;

/** Which grouped section a card belongs under in the feed. */
export type InsightSection = "today" | "week";
/** Drives the card's badge tint + dot colour on the client. */
export type InsightAccent = "blue" | "orange" | "coral" | "gradient" | "muted";
/** Trend arrow direction for a delta pill. */
export type InsightDirection = "up" | "down" | "steady";
export type InsightKind = "streak" | "readiness" | "sleep" | "restingHr" | "energySleep" | "nudge";

/** Trailing pill on a card (readiness, resting HR). */
export type InsightDelta = { label: string; direction: InsightDirection };

export type Insight = {
  /** stable key for the feed */
  id: string;
  section: InsightSection;
  kind: InsightKind;
  accent: InsightAccent;
  /** emoji shown in the badge instead of a colour dot (streak) */
  emoji?: string;
  headline: string;
  subline: string;
  /** trailing delta pill */
  delta?: InsightDelta;
  /** sparkline series, oldest → newest (sleep) */
  sparkline?: number[];
};

/** One day's check-in, already resolved to a device-local date. */
export type CheckinPoint = {
  date: string;
  sleepHours: number;
  sleepQuality: number;
  energy: number;
  mood: number;
  weightKg: number | null;
};

/** A stored daily readiness score. */
export type ReadinessPoint = { date: string; score: number };

/** Everything the resolver gathers, handed to the pure generator. */
export type InsightsData = {
  /** device-local today, YYYY-MM-DD */
  today: string;
  /** current check-in streak */
  streak: number;
  /** check-ins over the trailing window (~14 days), any order */
  checkins: CheckinPoint[];
  /** resting-HR readings (bpm) in the last 7 days */
  recentHr: number[];
  /** resting-HR readings (bpm) in the 7 days before that */
  earlierHr: number[];
  /** distinct days in the window with any weight value */
  weightDayCount: number;
  /** stored readiness scores (last ~7 days), any order */
  readiness: ReadinessPoint[];
};

// ── Thresholds ───────────────────────────────────────────────────────────────
/** sleep at/above this (hours) is a "good" night for the energy correlation */
const GOOD_SLEEP_HOURS = 7;
/** energy must be at least this much higher (1–5 scale) to claim the link */
const ENERGY_LIFT = 0.5;
/** nights of sleep data before the sleep card says anything */
const SLEEP_MIN_NIGHTS = 2;
/** nights before the card also draws a sparkline */
const SPARKLINE_MIN_NIGHTS = 3;
/** readiness must move by more than this to read as up/down (else steady) */
const READINESS_EPS = 2;
/** resting HR must move by more than this (bpm) to read as rising/falling */
const HR_STEADY_BPM = 1.5;
/** distinct weight days needed for a trend — below this we nudge */
const WEIGHT_TREND_MIN = 3;
/** how far back the readiness trend compares (days) */
const TREND_LOOKBACK_DAYS = 3;
/** check-ins needed before the energy×sleep card can appear */
const ENERGY_MIN_CHECKINS = 6;

// ── Small pure helpers ───────────────────────────────────────────────────────
const mean = (xs: number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length;

/** UTC-noon-free day number for a YYYY-MM-DD string (for stable differences). */
function toDayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

/** Whole days from `b` to `a` (a − b). */
function dayDiff(a: string, b: string): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** 7.2 → "7h 12m". */
function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 60) return `${h + 1}h 0m`;
  return `${h}h ${m}m`;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

// ── Individual cards ─────────────────────────────────────────────────────────
function streakInsight(streak: number): Insight | null {
  if (streak < 1) return null;
  const nextWeek = (Math.floor(streak / 7) + 1) * 7;
  const toGo = nextWeek - streak;
  const weeks = nextWeek / 7;
  const target = weeks === 1 ? "a full week" : `${weeks} weeks`;
  const subline = toGo === 1 ? `Tomorrow makes it ${target}.` : `${toGo} more days to ${target}.`;
  return {
    id: "streak",
    section: "today",
    kind: "streak",
    accent: "orange",
    emoji: "🔥",
    headline: `You’re on a ${streak}-day check-in streak.`,
    subline,
  };
}

function readinessInsight(points: ReadinessPoint[], today: string): Insight | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = sorted[sorted.length - 1]!;
  // Only compare within the lookback window; the earliest inside it is the baseline.
  const inWindow = sorted.filter((p) => {
    const gap = dayDiff(latest.date, p.date);
    return gap >= 0 && gap <= TREND_LOOKBACK_DAYS;
  });
  if (inWindow.length < 2) return null;
  const baseline = inWindow[0]!;
  const span = dayDiff(latest.date, baseline.date);
  if (span < 1) return null;

  const delta = latest.score - baseline.score;
  const direction: InsightDirection = delta > READINESS_EPS ? "up" : delta < -READINESS_EPS ? "down" : "steady";
  const headline =
    direction === "up"
      ? "Readiness is trending up."
      : direction === "down"
        ? "Readiness is trending down."
        : "Readiness is holding steady.";
  const when = latest.date === today ? "today" : "recently";
  const days = `${span} ${plural(span, "day", "days")}`;
  const subline =
    direction === "steady"
      ? `About the same as ${days} ago · ${latest.score} ${when}`
      : `${delta > 0 ? "+" : ""}${delta} over the last ${days} · ${latest.score} ${when}`;
  const label = direction === "steady" ? "steady" : `${delta > 0 ? "+" : ""}${delta}`;

  return {
    id: "readiness",
    section: "today",
    kind: "readiness",
    accent: "gradient",
    headline,
    subline,
    delta: { label, direction },
  };
}

function sleepInsight(checkins: CheckinPoint[], today: string): Insight | null {
  const thisWeek = checkins
    .filter((c) => {
      const gap = dayDiff(today, c.date);
      return gap >= 0 && gap <= 6;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (thisWeek.length < SLEEP_MIN_NIGHTS) return null;

  const avgThis = mean(thisWeek.map((c) => c.sleepHours));
  const lastWeek = checkins.filter((c) => {
    const gap = dayDiff(today, c.date);
    return gap >= 7 && gap <= 13;
  });

  let subline: string;
  if (lastWeek.length >= SLEEP_MIN_NIGHTS) {
    const deltaMin = Math.round((avgThis - mean(lastWeek.map((c) => c.sleepHours))) * 60);
    subline =
      Math.abs(deltaMin) < 5
        ? "About the same as last week."
        : deltaMin > 0
          ? `About ${deltaMin} min more than last week.`
          : `About ${Math.abs(deltaMin)} min less than last week.`;
  } else {
    subline = `Across ${thisWeek.length} ${plural(thisWeek.length, "night", "nights")} so far.`;
  }

  const insight: Insight = {
    id: "sleep",
    section: "week",
    kind: "sleep",
    accent: "blue",
    headline: `You’ve averaged ${formatDuration(avgThis)} of sleep this week.`,
    subline,
  };
  if (thisWeek.length >= SPARKLINE_MIN_NIGHTS) insight.sparkline = thisWeek.map((c) => c.sleepHours);
  return insight;
}

function restingHrInsight(recentHr: number[], earlierHr: number[]): Insight | null {
  if (recentHr.length < 2) return null;
  const avg = Math.round(mean(recentHr));
  const min = Math.round(Math.min(...recentHr));
  const max = Math.round(Math.max(...recentHr));

  let direction: InsightDirection = "steady";
  if (earlierHr.length >= 2) {
    const diff = mean(recentHr) - mean(earlierHr);
    direction = diff > HR_STEADY_BPM ? "up" : diff < -HR_STEADY_BPM ? "down" : "steady";
  }

  const headline =
    direction === "up"
      ? `Resting heart rate is edging up, around ${avg} bpm.`
      : direction === "down"
        ? `Resting heart rate is easing down, around ${avg} bpm.`
        : `Resting heart rate is steady around ${avg} bpm.`;
  const subline = min === max ? `Right around ${avg} bpm.` : `Within your usual ${min}–${max} range.`;
  const label = direction === "up" ? "rising" : direction === "down" ? "falling" : "steady";

  return {
    id: "restingHr",
    section: "week",
    kind: "restingHr",
    accent: "orange",
    headline,
    subline,
    delta: { label, direction },
  };
}

function energySleepInsight(checkins: CheckinPoint[]): Insight | null {
  if (checkins.length < ENERGY_MIN_CHECKINS) return null;
  const good = checkins.filter((c) => c.sleepHours >= GOOD_SLEEP_HOURS);
  const low = checkins.filter((c) => c.sleepHours < GOOD_SLEEP_HOURS);
  if (good.length < 2 || low.length < 2) return null;
  if (mean(good.map((c) => c.energy)) - mean(low.map((c) => c.energy)) < ENERGY_LIFT) return null;

  return {
    id: "energySleep",
    section: "week",
    kind: "energySleep",
    accent: "coral",
    headline: "Your energy has been highest on days you slept 7h+.",
    subline: `Seen across ${good.length} of your check-ins.`,
  };
}

function weightNudge(checkins: CheckinPoint[], weightDayCount: number): Insight | null {
  // Only nudge users who are already logging; a brand-new user should see the
  // cold-start empty state, not a lone nudge.
  if (checkins.length < 2) return null;
  if (weightDayCount >= WEIGHT_TREND_MIN) return null;
  const remaining = WEIGHT_TREND_MIN - weightDayCount;
  return {
    id: "nudge-weight",
    section: "week",
    kind: "nudge",
    accent: "muted",
    headline: "Log weight to unlock a trend.",
    subline: `${remaining} more ${plural(remaining, "entry", "entries")} to go.`,
  };
}

/**
 * Build the ordered insight feed. Order matches the design: the "today" cards
 * (streak, readiness) first, then the "week" cards (sleep, resting HR, the
 * energy link, a nudge). Each is dropped when its data doesn't support it.
 */
export function computeInsights(data: InsightsData): Insight[] {
  return [
    streakInsight(data.streak),
    readinessInsight(data.readiness, data.today),
    sleepInsight(data.checkins, data.today),
    restingHrInsight(data.recentHr, data.earlierHr),
    energySleepInsight(data.checkins),
    weightNudge(data.checkins, data.weightDayCount),
  ].filter((i): i is Insight => i !== null);
}
