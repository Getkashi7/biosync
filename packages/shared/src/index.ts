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
export { insightsInput, computeInsights } from "./insights";
export type {
  InsightsInput,
  InsightsData,
  Insight,
  InsightSection,
  InsightAccent,
  InsightDirection,
  InsightKind,
  InsightDelta,
  CheckinPoint,
  ReadinessPoint,
} from "./insights";
export { digestInput, computeDigest } from "./digest";
export type { DigestInput, DigestData, Digest, DigestCard, DigestFamily, MetricWindow } from "./digest";
export {
  nutritionDayInput,
  mealInput,
  mealRemoveInput,
  estimateInput,
  parseMacroEstimate,
  macroTargets,
  summariseDay,
  nutritionRead,
  DEFAULT_TARGETS,
} from "./nutrition";
export type {
  NutritionDayInput,
  MealInput,
  EstimateInput,
  MacroEstimate,
  MacroTargets,
  MacroTotals,
  MealPoint,
  NutritionDay,
  NutritionRead,
} from "./nutrition";
export {
  supplementTiming,
  supplementInput,
  supplementIdInput,
  supplementTakenInput,
  supplementDayInput,
  supplementSuggestInput,
  buildSchedule,
  parseSuggestions,
  suggestionGuard,
  TIMING_ORDER,
  TIMING_LABEL,
} from "./supplements";
export {
  consentCategory,
  consentAudience,
  consentSetInput,
  mergeConsents,
  sharedWith,
  sharesAnything,
  CONSENT_ORDER,
  CONSENT_COPY,
  AUDIENCE_LABEL,
} from "./consent";
export type { ConsentCategory, ConsentAudience, ConsentSetInput, ConsentRow } from "./consent";
export { planItem, planSaveInput, planListInput, noteCreateInput, parsePlanItems, isoWeek } from "./training";
export type { PlanItem, PlanSaveInput, NoteCreateInput } from "./training";
export { staffVisibleCategories, staffCanSee, ROLE_CEILING, ROLE_AUDIENCE } from "./staffAccess";
export type { StaffRole } from "./staffAccess";
export {
  inviteKind,
  inviteCreateInput,
  inviteCodeInput,
  inviteRevokeInput,
  normaliseInviteCode,
  isInviteCodeShape,
  formatInviteCode,
  buildInviteCode,
  inviteState,
  isRedeemable,
  inviteExpiry,
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_TTL_HOURS,
} from "./invites";
export type { InviteKind, InviteCreateInput, InviteCodeInput, InviteState } from "./invites";
export { AUDIT, sanitiseAuditMeta } from "./audit";
export type { AuditAction, AuditMeta, AuditEntry } from "./audit";
export type {
  SupplementTiming,
  SupplementInput,
  StackItem,
  ScheduledDose,
  ScheduleSlot,
  SupplementDay,
  TakenTick,
  Suggestion,
} from "./supplements";
