/**
 * Shared validation for point Metrics — objective readings (resting HR, weight,
 * HRV, glucose…) that can be logged many times a day, unlike the one-per-day
 * DailyLog check-in. Used by the API at the tRPC boundary (source of truth for
 * the input shape) and inferred end-to-end by the mobile client via AppRouter.
 *
 * The enum members mirror the Prisma `MetricType` / `MetricSource` enums by
 * value, so the parsed input drops straight into Prisma without a mapping.
 */
import { z } from "zod";

export const metricType = z.enum([
  "SLEEP_HOURS",
  "SLEEP_QUALITY",
  "RESTING_HR",
  "HRV",
  "GLUCOSE",
  "WEIGHT",
  "HYDRATION",
  "ENERGY",
  "MOOD",
]);

export type MetricType = z.infer<typeof metricType>;

export const metricSource = z.enum([
  "MANUAL",
  "HEALTH_CONNECT",
  "APPLE_HEALTH",
  "OURA",
  "WHOOP",
  "LIBRE",
]);

export type MetricSource = z.infer<typeof metricSource>;

/**
 * Plausible [min, max] per type, in the unit the API stores: hours, 1–5 rating,
 * bpm, ms, mg/dL, kg, ml. Deliberately wide — this rejects nonsense and typos
 * (a resting HR of 500), not unusual-but-real readings.
 */
export const METRIC_RANGES: Record<MetricType, readonly [number, number]> = {
  SLEEP_HOURS: [0, 24],
  SLEEP_QUALITY: [1, 5],
  RESTING_HR: [20, 250],
  HRV: [0, 500],
  GLUCOSE: [10, 1000],
  WEIGHT: [1, 1000],
  HYDRATION: [0, 20000],
  ENERGY: [1, 5],
  MOOD: [1, 5],
};

/**
 * One reading. There is deliberately no `userId` — it always comes from the
 * session, and Zod strips unknown keys, so a client cannot log against someone
 * else's account.
 */
export const metricLogInput = z
  .object({
    type: metricType,
    value: z.number().finite(),
    /** instant of the reading; the server defaults to now() when omitted */
    recordedAt: z.string().datetime().optional(),
    /** the server defaults to MANUAL when omitted */
    source: metricSource.optional(),
  })
  .superRefine((input, ctx) => {
    const [min, max] = METRIC_RANGES[input.type];
    if (input.value < min || input.value > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `${input.type} must be between ${min} and ${max}`,
      });
    }
  });

export type MetricLogInput = z.infer<typeof metricLogInput>;

export const metricRangeInput = z.object({
  type: metricType,
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export type MetricRangeInput = z.infer<typeof metricRangeInput>;
