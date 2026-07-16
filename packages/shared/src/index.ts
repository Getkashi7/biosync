/**
 * Public surface of @pulse/shared — code shared by the API and (type-only) the
 * mobile client: check-in validation, the streak calculation, and metric
 * validation.
 */
export { checkinInput, streakInput, dateStringSchema } from "./checkin";
export type { CheckinInput, StreakInput } from "./checkin";
export { computeStreak, prevDay } from "./streak";
export { metricType, metricSource, metricLogInput, metricRangeInput, METRIC_RANGES } from "./metrics";
export type { MetricType, MetricSource, MetricLogInput, MetricRangeInput } from "./metrics";
