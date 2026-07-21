/**
 * Supplements — the user's own stack and the day's dose strip.
 *
 * INFORMATIONAL ONLY. Every stack entry is user-entered: the app never
 * prescribes, never sets a dose, and never links a supplement to a condition.
 * `suggest` is the one AI surface, and it is deliberately fenced in — the prompt
 * forbids advice, and `parseSuggestions` drops any entry whose wording strays
 * into treatment or dosing before it can reach the client.
 *
 * userId always comes from ctx.user, and every mutation is scoped by it so a row
 * can only ever be touched by its owner. No health values are logged.
 */

import {
  AUDIT,
  buildSchedule,
  parseSuggestions,
  supplementDayInput,
  supplementIdInput,
  supplementInput,
  supplementSuggestInput,
  supplementTakenInput,
  type StackItem,
} from "@pulse/shared";
import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";
import { toDbDate } from "../dbDate";
import { groqChat, hasGroqKey } from "../lib/groq";
import { recordAudit } from "../lib/audit";

const userProcedure = ownerProcedure;

const DAY_MS = 24 * 60 * 60 * 1000;

const SUGGEST_SYSTEM = `You surface GENERAL, WIDELY-KNOWN information about common wellness supplements, for an adult using a self-tracking app.

Hard rules — breaking any of these makes the answer unusable:
- You are NOT a clinician. Never diagnose, never name a condition, disease, disorder or deficiency, never say anything is a treatment or cure, and never tell the user to take anything.
- Never give a dose, amount, or mg/IU figure.
- Never suggest replacing or changing any medication.
- Frame everything as what is commonly discussed or studied in general wellness, and note it's worth raising with a pharmacist or doctor.
- Tie each entry to the user's own logged patterns below (sleep, energy, training, readiness) in plain language.

Reply with ONLY a JSON object, no prose around it:
{"suggestions":[{"name": string, "rationale": string (one sentence, informational), "evidence": 1-4}]}
2 to 4 entries. "evidence" is how well-established the GENERAL research is: 4 = very well studied, 1 = preliminary.`;

/** A compact, plain-text snapshot of recent patterns for the suggestion prompt. */
async function buildPatterns(userId: string): Promise<string> {
  const since = new Date(Date.now() - 14 * DAY_MS);
  const [snapshot, logs] = await Promise.all([
    prisma.readinessSnapshot.findFirst({
      where: { userId },
      orderBy: { date: "desc" },
      select: { score: true },
    }),
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "desc" },
      select: { sleepHours: true, energy: true, mood: true },
      take: 14,
    }),
  ]);

  const lines: string[] = [];
  lines.push(snapshot ? `Readiness (most recent): ${snapshot.score}/100.` : "Readiness: nothing scored yet.");
  if (logs.length > 0) {
    const avg = (xs: number[]) => Number((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1));
    lines.push(
      `Last ${logs.length} check-ins — average sleep ${avg(logs.map((l) => l.sleepHours))}h, energy ${avg(
        logs.map((l) => l.energy),
      )}/5, mood ${avg(logs.map((l) => l.mood))}/5.`,
    );
  } else {
    lines.push("Daily check-ins: none logged yet.");
  }
  return lines.join("\n");
}

export const supplementsRouter = router({
  /** The user's stack plus the day's AM/PRE/PM strip and adherence. */
  day: userProcedure.input(supplementDayInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const [stack, ticks] = await Promise.all([
      prisma.supplement.findMany({
        where: { userId, active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, dose: true, timings: true, note: true },
      }),
      prisma.supplementLog.findMany({
        where: { userId, date: toDbDate(input.date) },
        select: { supplementId: true, timing: true },
      }),
    ]);

    const items: StackItem[] = stack.map((s) => ({
      id: s.id,
      name: s.name,
      dose: s.dose,
      timings: s.timings,
      note: s.note,
    }));

    return { stack: items, ...buildSchedule(items, ticks) };
  }),

  /** Add an entry the user has chosen to take. */
  add: userProcedure.input(supplementInput).mutation(async ({ ctx, input }) => {
    const created = await prisma.supplement.create({
      data: {
        userId: ctx.user.id,
        name: input.name,
        dose: input.dose,
        timings: input.timings,
        note: input.note ?? null,
      },
      select: { id: true },
    });
    // name is the user's own label, not a measurement; dose/note are never logged
    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.supplementAdded,
      entity: "supplement",
      entityId: created.id,
      meta: { name: input.name, timings: input.timings.length },
    });
    return { id: created.id };
  }),

  /** Remove an entry (and its ticks, via cascade). Scoped by userId. */
  remove: userProcedure.input(supplementIdInput).mutation(async ({ ctx, input }) => {
    const { count } = await prisma.supplement.deleteMany({
      where: { id: input.id, userId: ctx.user.id },
    });
    if (count > 0) {
      await recordAudit({
        actorId: ctx.user.id,
        action: AUDIT.supplementRemoved,
        entity: "supplement",
        entityId: input.id,
      });
    }
    return { removed: count };
  }),

  /**
   * Tick or untick one dose for a day. Idempotent: the unique
   * (supplement, date, timing) makes repeated taps safe.
   */
  setTaken: userProcedure.input(supplementTakenInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    // Confirm ownership before writing a log row against it.
    const owned = await prisma.supplement.findFirst({
      where: { id: input.id, userId },
      select: { id: true },
    });
    if (!owned) return { taken: false };

    const date = toDbDate(input.date);
    if (input.taken) {
      await prisma.supplementLog.upsert({
        where: { supplementId_date_timing: { supplementId: input.id, date, timing: input.timing } },
        create: { userId, supplementId: input.id, date, timing: input.timing },
        update: {},
      });
    } else {
      await prisma.supplementLog.deleteMany({
        where: { userId, supplementId: input.id, date, timing: input.timing },
      });
    }
    return { taken: input.taken };
  }),

  /**
   * Informational suggestions, grounded in the user's own patterns. Returns
   * `suggestions: null` when the coach is off or nothing survived the safety
   * filter — the client then shows the informational empty state rather than
   * anything that could read as advice.
   */
  suggest: userProcedure.input(supplementSuggestInput).mutation(async ({ ctx, input }) => {
    if (!hasGroqKey()) return { suggestions: null, configured: false as const };
    const patterns = await buildPatterns(ctx.user.id);
    const focus = input.focus?.trim();
    const content = await groqChat(
      [
        { role: "system", content: `${SUGGEST_SYSTEM}\n\n--- The user's recent patterns ---\n${patterns}` },
        {
          role: "user",
          content: focus
            ? `What's generally discussed around ${focus}?`
            : "What's generally discussed for someone with my recent patterns?",
        },
      ],
      { json: true, maxTokens: 700 },
    );
    return { suggestions: content ? parseSuggestions(content) : null, configured: true as const };
  }),
});
