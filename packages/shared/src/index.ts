/**
 * Public surface of @pulse/shared — code shared by the API and (type-only) the
 * mobile client: check-in validation, the streak calculation, metric
 * validation, and the readiness formula.
 */
export { checkinInput, streakInput, dateStringSchema } from "./checkin";
export type { CheckinInput, StreakInput } from "./checkin";
export { computeStreak, prevDay } from "./streak";
export { metricType, metricSource, metricLogInput, metricRangeInput, METRIC_RANGES } from "./metrics";
export type { MetricType, MetricSource, MetricLogInput, MetricRangeInput } from "./metrics";
export { readinessInput, computeReadiness, baselineMean } from "./readiness";
export type { ReadinessInput, ReadinessInputs, ReadinessComponents, Readiness } from "./readiness";
export { logRangeInput, metricListInput } from "./range";
export type { LogRangeInput, MetricListInput } from "./range";
export { goalInput } from "./goals";
export type { GoalInput } from "./goals";
