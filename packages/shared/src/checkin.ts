/**
 * Shared validation for the Daily Check-in. Used by the API at the tRPC
 * boundary (source of truth for the input shape) and inferred end-to-end by the
 * mobile client via the AppRouter type.
 */
import { z } from "zod";

/** Device-local calendar date, YYYY-MM-DD. */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const checkinInput = z.object({
  /** the day this check-in is for (device-local) */
  date: dateStringSchema,
  /** 0–12 hours, in 0.5h steps */
  sleepHours: z.number().min(0).max(12).multipleOf(0.5),
  /** 1 (terrible) – 5 (great) */
  sleepQuality: z.number().int().min(1).max(5),
  /** 1 (very low) – 5 (very high) */
  energy: z.number().int().min(1).max(5),
  /** 1 (awful) – 5 (great) */
  mood: z.number().int().min(1).max(5),
  /** optional body weight in kilograms */
  weightKg: z.number().positive().max(1000).nullish(),
});

export type CheckinInput = z.infer<typeof checkinInput>;

export const streakInput = z.object({
  /** the user's device-local "today", so streaks are timezone-correct */
  today: dateStringSchema,
});

export type StreakInput = z.infer<typeof streakInput>;
