/**
 * Data layer for Quick Log. Kept apart from the sheet UI so the sheet stays
 * presentation-only and testable. Every filled field becomes its own Metric row,
 * all stamped with the same instant so one save reads as one moment.
 */
import { trpc } from "../../lib/trpc";

/**
 * The point metrics Quick Log records — the objective readings the daily
 * check-in doesn't cover. Narrower than the API's MetricType on purpose; the
 * `metrics.log` input type still checks these at the call site.
 */
export type QuickLogMetric = "RESTING_HR" | "WEIGHT" | "HRV" | "GLUCOSE";

export type MetricEntry = {
  type: QuickLogMetric;
  /** already in the API's storage unit (kg for WEIGHT, bpm, ms, mg/dL) */
  value: number;
};

/** Persist every filled field; resolves with how many readings were saved. */
export async function submitMetrics(entries: MetricEntry[]): Promise<number> {
  const recordedAt = new Date().toISOString();
  await Promise.all(entries.map((entry) => trpc.metrics.log.mutate({ ...entry, recordedAt })));
  return entries.length;
}
