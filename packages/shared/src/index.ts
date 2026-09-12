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
export {
  NUDGE_TYPES,
  nudgeType,
  hhmm,
  nudgeSetting,
  nudgeSettingInput,
  notificationPrefsInput,
  defaultNotificationPrefs,
  activeNudges,
  mergeNudges,
  isInQuietHours,
  parseHm,
  DEFAULT_QUIET_START,
  DEFAULT_QUIET_END,
} from "./notifications";
export type { NudgeType, NudgeSetting, NotificationPrefs, NotificationPrefsInput } from "./notifications";
export {
  photoAudience,
  photoUploadInput,
  photoIdInput,
  photoVisibilityInput,
  photoListInput,
  effectivePhotoAudience,
  hasVisibilityOverride,
  tileDate,
  monthHeading,
  groupByMonth,
} from "./photos";
export type { PhotoUploadInput, PhotoIdInput, PhotoVisibilityInput, PhotoListInput } from "./photos";
export {
  TREATMENT_DISCLAIMER,
  TREATMENT_PENDING_NOTE,
  TREATMENT_QUEUE_DISCLAIMER,
  TREATMENT_QUEUE_LEAD,
  MIN_DECLINE_REASON,
  TREATMENT_PROTOCOLS,
  APPROVAL_TTL_DAYS,
  SIGNAL_WINDOW_DAYS,
  SIGNAL_THRESHOLDS,
  TERMINAL_STATUSES,
  treatmentTrigger,
  treatmentStatus,
  treatmentRequestInput,
  treatmentIdInput,
  treatmentDecisionInput,
  protocolBySlug,
  protocolName,
  suggestTreatments,
  countSignals,
  isTerminal,
  isOpen,
  canTransition,
  canReview,
  approvalExpiresAt,
  canProceedToBooking,
  effectiveStatus,
  daysUntilExpiry,
} from "./treatments";
export type {
  TreatmentProtocol,
  TreatmentTrigger,
  TreatmentStatus,
  TreatmentActor,
  TreatmentSignals,
  SignalDay,
  TreatmentSuggestion,
  TreatmentRequestInput,
  TreatmentIdInput,
  TreatmentDecisionInput,
} from "./treatments";
export {
  READINESS_BANDS,
  EXERCISES,
  movementPattern,
  planFocus,
  sessionFeedback,
  fitnessWeekInput,
  toggleExerciseInput,
  completeSessionInput,
  scaleForReadiness,
  exerciseBySlug,
  focusForMetric,
  feedbackAdjustment,
  buildWeek,
  weekStartOf,
  addDays,
} from "./fitness";
export type {
  ReadinessBand,
  Scaling,
  Exercise,
  MovementPattern,
  PlanFocus,
  PlannedExercise,
  PlannedSession,
  SessionFeedback,
  BuildWeekInput,
  FitnessWeekInput,
  ToggleExerciseInput,
  CompleteSessionInput,
} from "./fitness";
