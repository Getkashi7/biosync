/**
 * Public surface of @pulse/shared — code shared by the API and (type-only) the
 * mobile client: check-in validation and the streak calculation.
 */
export { checkinInput, streakInput, dateStringSchema } from "./checkin";
export type { CheckinInput, StreakInput } from "./checkin";
export { computeStreak, prevDay } from "./streak";
