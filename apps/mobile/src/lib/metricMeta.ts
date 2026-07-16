/**
 * Display metadata per metric type — name, unit, and dot color. Shared by the
 * journal feed, goal cards, and the metric picker in the New-goal sheet.
 * Keys mirror the API's MetricType enum values.
 */
import { color } from "../ui/theme";

export type MetricMeta = { name: string; unit: string; dot: string };

export const METRIC_META: Record<string, MetricMeta> = {
  RESTING_HR: { name: "Resting HR", unit: "bpm", dot: color.blue },
  HRV: { name: "HRV", unit: "ms", dot: color.orange },
  GLUCOSE: { name: "Glucose", unit: "mg/dL", dot: color.coral },
  WEIGHT: { name: "Weight", unit: "kg", dot: color.blue2 },
  SLEEP_HOURS: { name: "Sleep", unit: "h", dot: color.blue2 },
  SLEEP_QUALITY: { name: "Sleep quality", unit: "/5", dot: color.blue },
  HYDRATION: { name: "Hydration", unit: "ml", dot: color.blue2 },
  ENERGY: { name: "Energy", unit: "/5", dot: color.orange },
  MOOD: { name: "Mood", unit: "/5", dot: color.coral },
};

export const FALLBACK_META: MetricMeta = { name: "Metric", unit: "", dot: color.blue2 };
