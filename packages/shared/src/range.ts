/**
 * Shared window inputs for the read-back queries that power trends and the
 * journal: check-ins over a span of calendar days, and metrics of every type
 * over a span of instants.
 */
import { z } from "zod";
import { dateStringSchema } from "./checkin";

/** Check-in window — device-local calendar days, inclusive. */
export const logRangeInput = z.object({
  from: dateStringSchema,
  to: dateStringSchema,
});

export type LogRangeInput = z.infer<typeof logRangeInput>;

/** All-types metric window — ISO instants, inclusive. */
export const metricListInput = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export type MetricListInput = z.infer<typeof metricListInput>;
