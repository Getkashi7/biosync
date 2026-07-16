/**
 * Data layer for the 7-day trend cards. Pulls check-ins (sleep hours, check-in
 * weight) and metrics (resting HR, weight readings) for the trailing week and
 * buckets them per device-local day, oldest first — ready to plot.
 *
 * A series is chartable at 3+ days of data; below that the card shows its
 * "log a few more days" copy. Weight prefers a Metric reading over the
 * check-in's weightKg when a day has both.
 */
import { trpc } from "../../lib/trpc";
import { todayLocal } from "../checkin/checkinApi";

const TREND_DAYS = 7;
/** minimum days with data before a sparkline says anything */
export const MIN_TREND_POINTS = 3;

export type TrendSeries = {
  /** one value per day that has data, oldest → newest */
  values: number[];
  /** mean of values (latest for weight), null when empty */
  stat: number | null;
};

export type Trends = {
  sleep: TrendSeries;
  restingHr: TrendSeries;
  weight: TrendSeries;
};

/** Device-local YYYY-MM-DD of `daysBack` days ago. */
function localDayAgo(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return todayLocal(d);
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

/** Collapse per-day buckets (keyed YYYY-MM-DD) into an oldest-first series. */
function toSeries(byDay: Map<string, number[]>, stat: "mean" | "latest"): TrendSeries {
  const days = [...byDay.keys()].sort();
  const values = days
    .map((day) => mean(byDay.get(day) ?? []))
    .filter((v): v is number => v !== null);
  return {
    values,
    stat: values.length ? (stat === "latest" ? values[values.length - 1]! : mean(values)) : null,
  };
}

export async function fetchTrends(): Promise<Trends> {
  const now = new Date();
  const fromIso = new Date(now.getTime() - TREND_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [checkins, hrReadings, weightReadings] = await Promise.all([
    trpc.logs.range.query({ from: localDayAgo(TREND_DAYS - 1), to: todayLocal() }),
    trpc.metrics.range.query({ type: "RESTING_HR", from: fromIso, to: now.toISOString() }),
    trpc.metrics.range.query({ type: "WEIGHT", from: fromIso, to: now.toISOString() }),
  ]);

  const sleepByDay = new Map<string, number[]>();
  const weightByDay = new Map<string, number[]>();
  for (const c of checkins) {
    sleepByDay.set(c.date, [c.sleepHours]);
    if (c.weightKg !== null) weightByDay.set(c.date, [c.weightKg]);
  }

  const hrByDay = new Map<string, number[]>();
  for (const r of hrReadings) {
    const day = todayLocal(new Date(r.recordedAt));
    hrByDay.set(day, [...(hrByDay.get(day) ?? []), r.value]);
  }
  // Metric weight readings replace a check-in weight on the same day.
  const metricWeightByDay = new Map<string, number[]>();
  for (const r of weightReadings) {
    const day = todayLocal(new Date(r.recordedAt));
    metricWeightByDay.set(day, [...(metricWeightByDay.get(day) ?? []), r.value]);
  }
  for (const [day, values] of metricWeightByDay) {
    weightByDay.set(day, values);
  }

  return {
    sleep: toSeries(sleepByDay, "mean"),
    restingHr: toSeries(hrByDay, "mean"),
    weight: toSeries(weightByDay, "latest"),
  };
}
