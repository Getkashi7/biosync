/**
 * Supplements — validation plus the pure logic behind the day's dose strip.
 *
 * IMPORTANT: this feature is informational only. The stack is entirely
 * user-entered — the app never prescribes, never sets a dose, and never ties a
 * supplement to a condition. `suggestionGuard` exists to keep even the AI
 * suggestion surface on the safe side of that line.
 *
 * `buildSchedule` turns a stack plus the day's taken-ticks into the AM/PRE/PM
 * strip the UI draws, with adherence — pure, so it's unit-testable.
 */
import { z } from "zod";
import { dateStringSchema } from "./checkin";

export const supplementTiming = z.enum(["AM", "PRE", "PM"]);
export type SupplementTiming = z.infer<typeof supplementTiming>;

/** display order of the day's slots */
export const TIMING_ORDER: SupplementTiming[] = ["AM", "PRE", "PM"];

export const TIMING_LABEL: Record<SupplementTiming, string> = {
  AM: "Morning",
  PRE: "Pre-workout",
  PM: "Evening",
};

export const supplementInput = z.object({
  name: z.string().min(1).max(80),
  /** free text so any unit works ("2000 IU", "5 g", "1 capsule") */
  dose: z.string().min(1).max(40),
  timings: z.array(supplementTiming).min(1).max(3),
  note: z.string().max(200).nullish(),
});
export type SupplementInput = z.infer<typeof supplementInput>;

export const supplementIdInput = z.object({ id: z.string().uuid() });

export const supplementTakenInput = z.object({
  id: z.string().uuid(),
  date: dateStringSchema,
  timing: supplementTiming,
  taken: z.boolean(),
});

export const supplementDayInput = z.object({ date: dateStringSchema });

export const supplementSuggestInput = z.object({
  /** optional free-text focus, e.g. "sleep" — never a condition */
  focus: z.string().max(80).nullish(),
});

// ── The day's strip ──────────────────────────────────────────────────────────
export type StackItem = {
  id: string;
  name: string;
  dose: string;
  timings: SupplementTiming[];
  note: string | null;
};

/** one supplement due in one slot */
export type ScheduledDose = {
  id: string;
  name: string;
  dose: string;
  timing: SupplementTiming;
  taken: boolean;
};

export type ScheduleSlot = {
  timing: SupplementTiming;
  label: string;
  doses: ScheduledDose[];
};

export type SupplementDay = {
  slots: ScheduleSlot[];
  /** doses ticked off today */
  taken: number;
  /** doses due today */
  due: number;
  /** taken / due, 0 when nothing is due */
  adherence: number;
};

/** a taken tick, as stored */
export type TakenTick = { supplementId: string; timing: SupplementTiming };

const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * Expand a stack into the day's AM/PRE/PM slots, marking which doses are already
 * ticked. Empty slots are dropped so the strip only shows what's actually due.
 */
export function buildSchedule(stack: StackItem[], ticks: TakenTick[]): SupplementDay {
  const tickSet = new Set(ticks.map((t) => `${t.supplementId}:${t.timing}`));
  let taken = 0;
  let due = 0;

  const slots: ScheduleSlot[] = [];
  for (const timing of TIMING_ORDER) {
    const doses: ScheduledDose[] = [];
    for (const item of stack) {
      if (!item.timings.includes(timing)) continue;
      const isTaken = tickSet.has(`${item.id}:${timing}`);
      due += 1;
      if (isTaken) taken += 1;
      doses.push({ id: item.id, name: item.name, dose: item.dose, timing, taken: isTaken });
    }
    if (doses.length > 0) slots.push({ timing, label: TIMING_LABEL[timing], doses });
  }

  return { slots, taken, due, adherence: due > 0 ? round2(taken / due) : 0 };
}

// ── AI suggestion safety ─────────────────────────────────────────────────────
export type Suggestion = {
  name: string;
  /** why it's commonly discussed, tied to the user's own logged patterns */
  rationale: string;
  /** 1–4 filled dots: how well-established the general evidence is */
  evidence: number;
};

const rawSuggestion = z.object({
  name: z.string().min(1).max(60),
  rationale: z.string().min(1).max(300),
  evidence: z.coerce.number().min(1).max(4),
});

const rawSuggestions = z.object({ suggestions: z.array(rawSuggestion).min(1).max(5) });

/**
 * Words that would turn an informational note into medical advice or a
 * prescription. A suggestion containing any of them is dropped rather than
 * shown — cheaper and safer than trusting the prompt alone.
 */
const UNSAFE = [
  "diagnos",
  "treat",
  "cure",
  "prescrib",
  "dose of",
  "take ",
  "mg daily",
  "disease",
  "disorder",
  "deficien",
  "symptom",
  "instead of your",
  "replace your",
];

/** Does this text stray from informational into advice/prescription? */
export function suggestionGuard(text: string): boolean {
  const lower = text.toLowerCase();
  return !UNSAFE.some((w) => lower.includes(w));
}

/**
 * Parse the model's suggestion JSON. Returns only the entries that survive the
 * safety guard; null when nothing usable is left, so the UI can say so plainly
 * rather than showing something it shouldn't.
 */
export function parseSuggestions(raw: string): Suggestion[] | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = rawSuggestions.safeParse(json);
  if (!parsed.success) return null;

  const safe = parsed.data.suggestions
    .filter((s) => suggestionGuard(s.rationale) && suggestionGuard(s.name))
    .map((s) => ({ name: s.name, rationale: s.rationale, evidence: Math.round(s.evidence) }));

  return safe.length > 0 ? safe : null;
}
