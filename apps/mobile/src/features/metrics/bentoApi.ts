/**
 * Data layer for the Metrics bento (Trends tab). Pulls the trailing window of
 * each objective metric and reduces it to what the tiles show: latest value,
 * average, a sparkline series, a week-over-week delta, plus glucose-derived
 * time-in-range and spike count. Presentation-agnostic.
 */
import { trpc } from "../../lib/trpc";
import type { MetricEntry } from "./metricApi";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;
/** healthy glucose band (mg/dL) for time-in-range + spikes */
const GLUCOSE_LOW = 70;
const GLUCOSE_HIGH = 140;

type Reading = { value: number; recordedAt: string };

export type BentoMetric = {
  latest: number | null;
  avg: number | null;
  /** oldest → newest values, for a sparkline */
  series: number[];
  /** recent-week mean minus prior-week mean, or null */
  deltaWeek: number | null;
};

export type BentoData = {
  glucose: BentoMetric;
  restingHr: BentoMetric;
  hrv: BentoMetric;
  weight: BentoMetric;
  /** % of glucose readings inside the healthy band, or null */
  timeInRange: number | null;
  /** glucose readings above the band today */
  spikesToday: number;
  /** whether anything has been logged at all */
  hasAny: boolean;
};

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function reduce(readings: Reading[], now: number): BentoMetric {
  const series = readings.map((r) => r.value);
  const sevenAgo = now - 7 * DAY_MS;
  const recent = readings.filter((r) => new Date(r.recordedAt).getTime() >= sevenAgo).map((r) => r.value);
  const prior = readings.filter((r) => new Date(r.recordedAt).getTime() < sevenAgo).map((r) => r.value);
  const rMean = mean(recent);
  const pMean = mean(prior);
  return {
    latest: series.length ? series[series.length - 1]! : null,
    avg: mean(series),
    series,
    deltaWeek: rMean !== null && pMean !== null ? rMean - pMean : null,
  };
}

export async function fetchMetricsBento(): Promise<BentoData> {
  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString();
  const to = now.toISOString();
  const q = (type: MetricEntry["type"]) => trpc.metrics.range.query({ type, from, to });

  const [glucose, restingHr, hrv, weight] = await Promise.all([q("GLUCOSE"), q("RESTING_HR"), q("HRV"), q("WEIGHT")]);
  const t = now.getTime();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const gToday = glucose.filter((r) => new Date(r.recordedAt).getTime() >= startOfToday.getTime());
  const inRange = glucose.filter((r) => r.value >= GLUCOSE_LOW && r.value <= GLUCOSE_HIGH).length;

  return {
    glucose: reduce(glucose, t),
    restingHr: reduce(restingHr, t),
    hrv: reduce(hrv, t),
    weight: reduce(weight, t),
    timeInRange: glucose.length ? Math.round((inRange / glucose.length) * 100) : null,
    spikesToday: gToday.filter((r) => r.value > GLUCOSE_HIGH).length,
    hasAny: glucose.length + restingHr.length + hrv.length + weight.length > 0,
  };
}
