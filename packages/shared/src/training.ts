/**
 * Training plans + session notes — the trainer's outputs.
 *
 * Plan items are validated here because they arrive as free-form JSON: the
 * database column can hold anything, so this is the boundary that decides what a
 * plan is actually allowed to contain.
 */
import { z } from "zod";

export const planItem = z.object({
  name: z.string().min(1).max(80),
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(1).max(100),
});
export type PlanItem = z.infer<typeof planItem>;

/** e.g. "2026-W30" */
export const weekSchema = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, "week must look like 2026-W30");

export const planSaveInput = z.object({
  clientId: z.string().uuid(),
  week: weekSchema,
  title: z.string().min(1).max(80),
  items: z.array(planItem).min(1).max(30),
});
export type PlanSaveInput = z.infer<typeof planSaveInput>;

export const planListInput = z.object({ clientId: z.string().uuid() });

export const noteCreateInput = z.object({
  clientId: z.string().uuid(),
  body: z.string().min(1).max(2000),
  /** the composer states plainly whether the client will see it */
  sharedWithClient: z.boolean().default(true),
});
export type NoteCreateInput = z.infer<typeof noteCreateInput>;

/**
 * Parse plan items coming back out of the JSON column. Returns [] rather than
 * throwing when a row predates a schema change or was written by hand — a
 * malformed plan should render as empty, never crash the builder.
 */
export function parsePlanItems(raw: unknown): PlanItem[] {
  const result = z.array(planItem).safeParse(raw);
  return result.success ? result.data : [];
}

/** The ISO week string for a date, e.g. "2026-W30". */
export function isoWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO weeks run Monday–Sunday and week 1 contains the first Thursday
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
