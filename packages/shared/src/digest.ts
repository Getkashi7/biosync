/**
 * Morning digest — the proactive counterpart to the Insights feed. Where insights
 * are plain-language observations, the digest is a small set of number-forward
 * cards (design 5C): one per metric family, each with a headline value, a short
 * non-diagnostic reading, and a confidence level from how much data backs it.
 *
 * Pure logic (like insights.ts): the API gathers the ingredients, this turns them
 * into an ordered, capped list of cards. Every value is the user's real data — no
 * number is invented — and readings stay observational, never medical.
 *
 * The cards feed the "Ask" morning digest; each carries an `ask` seed so tapping
 * "Ask about this" hands the topic to the LLM coach for the conversational part.
 */
import { z } from "zod";
import { dateStringSchema } from "./checkin";
import type { CheckinPoint, ReadinessPoint } from "./insights";

export const digestInput = z.object({
  /** the user's device-local "today", so the night's buckets are timezone-correct */
  today: dateStringSchema,
});
export type DigestInput = z.infer<typeof digestInput>;

/** One metric family; drives the card's hue + label on the client. */
export type DigestFamily = "sleep" | "hrv" | "glucose" | "restingHr" | "readiness";

export type DigestCard = {
  /** stable key for the list */
  id: DigestFamily;
  family: DigestFamily;
  /** uppercase family label, e.g. "SLEEP" */
  label: string;
  /** the Doto headline value, already formatted (e.g. "7.4", "64", "82") */
  value: string;
  /** unit suffix, e.g. "h", "ms", "mg/dL", "bpm", "/100" */
  unit: string;
  /** one-line observational reading (non-diagnostic) */
  reading: string;
  /** filled confidence dots, 1–4, from how many points back the card */
  confidence: number;
  /** seed question handed to the coach when the user taps "Ask about this" */
  ask: string;
};

export type Digest = {
  /** the assistant's lead line above the cards */
  greeting: string;
  cards: DigestCard[];
};

/** A metric's readings over the last 7 days and the 7 before, oldest → newest. */
export type MetricWindow = {
  recent: number[];
  earlier: number[];
};

/** Everything the resolver gathers, handed to the pure generator. */
export type DigestData = {
  today: string;
  /** stored readiness scores (last ~7 days), any order */
  readiness: ReadinessPoint[];
  /** check-ins over the trailing window (~14 days), any order (for sleep) */
  checkins: CheckinPoint[];
  hrv: MetricWindow;
  glucose: MetricWindow;
  restingHr: MetricWindow;
};

// ── Thresholds ───────────────────────────────────────────────────────────────
/** most cards want at least this many readings before they speak */
const MIN_POINTS = 1;
/** HRV move (%) that reads as up/down rather than steady */
const HRV_EPS_PCT = 5;
/** glucose move (mg/dL) that reads as up/down rather than steady */
const GLUCOSE_EPS = 6;
/** resting-HR move (bpm) that reads as up/down rather than steady */
const HR_EPS = 2;
/** sleep move (minutes) that reads as more/less rather than about the same */
const SLEEP_EPS_MIN = 15;
/** at most this many cards in a digest (design shows three) */
const MAX_CARDS = 3;

// ── Small pure helpers ───────────────────────────────────────────────────────
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const round1 = (x: number): string => String(Math.round(x * 10) / 10);
const clampConfidence = (n: number): number => Math.max(1, Math.min(4, n));
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

// ── Individual cards ─────────────────────────────────────────────────────────
function sleepCard(checkins: CheckinPoint[], today: string): DigestCard | null {
  const week = checkins
    .filter((c) => {
      const [y, m, d] = c.date.split("-").map(Number);
      const [ty, tm, td] = today.split("-").map(Number);
      const gap = Math.round((Date.UTC(ty!, tm! - 1, td!) - Date.UTC(y!, m! - 1, d!)) / 86_400_000);
      return gap >= 0 && gap <= 6;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (week.length < MIN_POINTS) return null;

  const latest = week[week.length - 1]!;
  const others = week.slice(0, -1);
  let reading: string;
  if (others.length >= 1) {
    const deltaMin = Math.round((latest.sleepHours - mean(others.map((c) => c.sleepHours))) * 60);
    reading =
      Math.abs(deltaMin) < SLEEP_EPS_MIN
        ? "Right around your recent nights."
        : deltaMin > 0
          ? `About ${deltaMin} min more than your recent nights.`
          : `About ${Math.abs(deltaMin)} min less than your recent nights.`;
  } else {
    reading = "Your first logged night this week.";
  }

  return {
    id: "sleep",
    family: "sleep",
    label: "Sleep",
    value: round1(latest.sleepHours),
    unit: "h",
    reading,
    confidence: clampConfidence(week.length),
    ask: "How did I sleep this week?",
  };
}

function windowCard(
  family: Exclude<DigestFamily, "sleep" | "readiness">,
  label: string,
  unit: string,
  ask: string,
  win: MetricWindow,
  read: (dir: "up" | "down" | "steady", latest: number, baseline: number | null) => string,
): DigestCard | null {
  if (win.recent.length < MIN_POINTS) return null;
  const latest = win.recent[win.recent.length - 1]!;
  const priorRecent = win.recent.slice(0, -1);
  const base = win.earlier.length >= 1 ? mean(win.earlier) : priorRecent.length >= 1 ? mean(priorRecent) : null;

  let dir: "up" | "down" | "steady" = "steady";
  if (base !== null) {
    const eps = family === "hrv" ? (base * HRV_EPS_PCT) / 100 : family === "glucose" ? GLUCOSE_EPS : HR_EPS;
    dir = latest - base > eps ? "up" : latest - base < -eps ? "down" : "steady";
  }

  return {
    id: family,
    family,
    label,
    value: String(Math.round(latest)),
    unit,
    reading: read(dir, latest, base),
    confidence: clampConfidence(win.recent.length + win.earlier.length),
    ask,
  };
}

function hrvCard(win: MetricWindow): DigestCard | null {
  return windowCard("hrv", "HRV", "ms", "What's my HRV trend telling me?", win, (dir, latest, base) => {
    if (dir === "steady") return "Holding around your recent nights.";
    const pct = base ? Math.round((Math.abs(latest - base) / base) * 100) : 0;
    return dir === "up"
      ? `Up about ${pct}% on your recent nights.`
      : `Down about ${pct}% on your recent nights.`;
  });
}

function glucoseCard(win: MetricWindow): DigestCard | null {
  return windowCard("glucose", "Glucose", "mg/dL", "What's driving my glucose?", win, (dir, latest, base) => {
    if (dir === "steady") return "Steady against your recent readings.";
    const diff = base ? Math.round(Math.abs(latest - base)) : 0;
    return dir === "up"
      ? `About ${diff} above your recent average.`
      : `About ${diff} below your recent average.`;
  });
}

function restingHrCard(win: MetricWindow): DigestCard | null {
  return windowCard("restingHr", "Resting HR", "bpm", "Why is my resting heart rate changing?", win, (dir, latest, base) => {
    if (dir === "steady") return "Right around your usual baseline.";
    const diff = base ? Math.round(Math.abs(latest - base)) : 0;
    return dir === "up" ? `About ${diff} above your baseline.` : `About ${diff} below your baseline.`;
  });
}

function readinessCard(points: ReadinessPoint[]): DigestCard | null {
  if (points.length < MIN_POINTS) return null;
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = sorted[sorted.length - 1]!;
  const others = sorted.slice(0, -1);

  let reading: string;
  if (others.length >= 1) {
    const max = Math.max(...others.map((p) => p.score));
    const avg = Math.round(mean(sorted.map((p) => p.score)));
    reading =
      latest.score >= max ? "Your best across these days." : `Recent days have averaged ${avg}.`;
  } else {
    reading = "Your first score in view.";
  }

  return {
    id: "readiness",
    family: "readiness",
    label: "Readiness",
    value: String(latest.score),
    unit: "/100",
    reading,
    confidence: clampConfidence(points.length),
    ask: "Why is my readiness where it is?",
  };
}

// ── Assembly ─────────────────────────────────────────────────────────────────
function greetingFor(count: number): string {
  if (count === 1) return "While you slept I looked at the night — one thing worth knowing.";
  return `While you slept I looked at the night — ${count} things worth knowing.`;
}

/**
 * Build the morning digest: number-forward cards in family priority (sleep, HRV,
 * glucose, resting HR, readiness), each dropped when its data doesn't support it,
 * capped to the top few. Returns an empty card list when nothing qualifies (the
 * client then shows the first-run Ask state instead).
 */
export function computeDigest(data: DigestData): Digest {
  const cards = [
    sleepCard(data.checkins, data.today),
    hrvCard(data.hrv),
    glucoseCard(data.glucose),
    restingHrCard(data.restingHr),
    readinessCard(data.readiness),
  ]
    .filter((c): c is DigestCard => c !== null)
    .slice(0, MAX_CARDS);

  return { greeting: greetingFor(cards.length), cards };
}
