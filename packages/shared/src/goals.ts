/**
 * Shared validation for Goals — a short statement of what the user is working
 * toward, optionally tied to the metric that measures it (drives the linked
 * chip on the goal card and, later, progress against trends).
 */
import { z } from "zod";
import { metricType } from "./metrics";

export const goalInput = z.object({
  /** e.g. "Get resting HR under 55" */
  description: z.string().trim().min(1).max(200),
  /** the metric this goal tracks, when it tracks one */
  targetMetric: metricType.optional(),
});

export type GoalInput = z.infer<typeof goalInput>;
