/**
 * Nutrition — the macro log behind the Today rings.
 *
 * `estimate` is the only AI step: it turns a plain-language meal ("2 eggs and
 * toast") into macros via Groq, validated by the pure `parseMacroEstimate` before
 * it can reach the client. It deliberately does NOT write anything — the user
 * confirms (and may adjust) the numbers, then `log` persists them. That keeps a
 * hallucinated number from silently entering someone's health record.
 *
 * `day` returns the meals plus the summed totals against targets scaled to the
 * user's most recent bodyweight. userId always comes from ctx.user, never input,
 * and `remove` is scoped by userId so a meal can only be deleted by its owner.
 * No health values are logged.
 */
import { MetricType } from "@prisma/client";
import {
  AUDIT,
  estimateInput,
  macroTargets,
  mealInput,
  mealRemoveInput,
  nutritionDayInput,
  nutritionRead,
  parseMacroEstimate,
  summariseDay,
} from "@pulse/shared";
import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";
import { toDbDate } from "../dbDate";
import { groqChat } from "../lib/groq";
import { recordAudit } from "../lib/audit";

const userProcedure = ownerProcedure;

const ESTIMATE_SYSTEM = `You estimate the nutrition content of a described meal.

Rules:
- Reply with ONLY a JSON object, no prose, in exactly this shape:
  {"calories": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number, "items": string[]}
- calories are kcal; proteinG/carbsG/fatG/fiberG are grams. Numbers only, no units, no ranges.
- "items" lists the individual foods you recognised, short and plain ("2 eggs", "slice of toast").
- Assume typical portion sizes when the description is vague. Be realistic, not cautious.
- This is a general nutrition estimate, not medical or dietary advice.`;

/**
 * The user's most recent bodyweight in kg, for scaling targets — a logged WEIGHT
 * metric wins over a check-in weight, since it's the more deliberate reading.
 * Null when they've never recorded one (targets then fall back to defaults).
 */
async function latestWeightKg(userId: string): Promise<number | null> {
  const [metric, log] = await Promise.all([
    prisma.metric.findFirst({
      where: { userId, type: MetricType.WEIGHT },
      orderBy: { recordedAt: "desc" },
      select: { value: true },
    }),
    prisma.dailyLog.findFirst({
      where: { userId, weightKg: { not: null } },
      orderBy: { date: "desc" },
      select: { weightKg: true },
    }),
  ]);
  return metric?.value ?? log?.weightKg ?? null;
}

export const nutritionRouter = router({
  /**
   * Estimate macros from a plain-language meal description. Read-only: returns
   * the estimate for the user to confirm. `estimate` is null when the coach isn't
   * configured or the model returned something we can't trust — the client then
   * lets the user enter the numbers by hand.
   */
  estimate: userProcedure.input(estimateInput).mutation(async ({ input }) => {
    const result = await groqChat(
      [
        { role: "system", content: ESTIMATE_SYSTEM },
        { role: "user", content: input.description },
      ],
      { json: true, maxTokens: 400 },
    );

    if (!result.ok) {
      // The reason travels to the client so the sheet can say something true.
      // "Couldn't reach the coach" was being shown for a rejected API key,
      // which sent people to check their wi-fi over a problem only we can fix.
      return { estimate: null, configured: result.reason !== "unconfigured", reason: result.reason };
    }

    const estimate = parseMacroEstimate(result.content);
    return {
      estimate,
      configured: true as const,
      // Answered, but not with numbers we can use — a different thing again
      // from never having answered.
      reason: estimate ? null : ("unusable" as const),
    };
  }),

  /**
   * Persist one meal against the caller's device-local day. Audited by id only —
   * the trail records that a meal was logged, never what was in it.
   */
  log: userProcedure.input(mealInput).mutation(async ({ ctx, input }) => {
    const meal = await prisma.meal.create({
      data: {
        userId: ctx.user.id,
        date: toDbDate(input.date),
        description: input.description,
        calories: input.calories,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        fiberG: input.fiberG ?? null,
        estimated: input.estimated,
      },
      select: { id: true },
    });
    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.mealLogged,
      entity: "meal",
      entityId: meal.id,
      meta: { estimated: input.estimated },
    });
    return { id: meal.id };
  }),

  /**
   * A day's meals (oldest → newest) plus totals, targets, ring progress and the
   * derived coach read. The read is computed here (not by the model and not on
   * the client, which consumes @pulse/shared type-only) so it can only ever
   * restate the user's own numbers.
   */
  day: userProcedure.input(nutritionDayInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const [meals, weightKg] = await Promise.all([
      prisma.meal.findMany({
        where: { userId, date: toDbDate(input.date) },
        orderBy: { loggedAt: "asc" },
        select: {
          id: true,
          description: true,
          calories: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
          fiberG: true,
          estimated: true,
          loggedAt: true,
        },
      }),
      latestWeightKg(userId),
    ]);

    const summary = summariseDay(meals, macroTargets(weightKg));
    return { meals, ...summary, read: nutritionRead(summary) };
  }),

  /** Delete one of the caller's meals. Scoped by userId — never by id alone. */
  remove: userProcedure.input(mealRemoveInput).mutation(async ({ ctx, input }) => {
    const { count } = await prisma.meal.deleteMany({
      where: { id: input.id, userId: ctx.user.id },
    });
    if (count > 0) {
      await recordAudit({ actorId: ctx.user.id, action: AUDIT.mealRemoved, entity: "meal", entityId: input.id });
    }
    return { removed: count };
  }),
});
