/**
 * AI Coach — a conversational wellness guide grounded in the user's own BIOSYNC
 * data (latest readiness, most recent check-in, recent point metrics). Sends the
 * conversation to Groq (Llama 3.3 70B — free tier, OpenAI-compatible API) with a
 * non-diagnostic system prompt.
 *
 * The Groq key is optional: without it the procedure returns a friendly
 * "not switched on yet" reply so the chat UI works before the key is set. The
 * userId always comes from ctx.user — never the client. No health values logged.
 */
import { z } from "zod";
import { MetricType } from "@prisma/client";
import { computeDigest, digestInput, type MetricWindow } from "@pulse/shared";
import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";
import { toDbDate, fromDbDate } from "../dbDate";
import { groqChat, hasGroqKey } from "../lib/groq";

const userProcedure = ownerProcedure;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shift a device-local YYYY-MM-DD by whole days. */
function shiftDay(date: string, deltaDays: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!) + deltaDays * DAY_MS);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

const chatInput = z.object({
  /** Full conversation so far, oldest → newest; the last entry is the new turn. */
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

const SYSTEM = `You are the BIOSYNC Coach — a calm, encouraging wellness guide inside a personal health app ("your body, in tune"). You help the user understand their own body data (readiness, sleep, energy, mood, resting heart rate, HRV, glucose, weight) and build better daily habits.

How to answer:
- Ground every reply in the user's data provided below. Refer to their actual numbers.
- You are NOT a doctor. Give general wellness guidance only — never diagnose, never name conditions, never prescribe or give medical treatment advice. If something sounds medical or worrying, gently suggest they speak with a healthcare professional.
- Be concise and warm: 2–5 short sentences unless they ask for more. No filler openers like "Great question".
- If their data is sparse, say what you'd be able to tell them once they've logged more, and encourage a check-in.`;

const METRIC_LABEL: Record<string, string> = {
  RESTING_HR: "resting HR",
  HRV: "HRV",
  GLUCOSE: "glucose",
  WEIGHT: "weight",
  SLEEP_HOURS: "sleep hours",
  SLEEP_QUALITY: "sleep quality",
  HYDRATION: "hydration",
  ENERGY: "energy",
  MOOD: "mood",
};

/** A compact, plain-text snapshot of the user's recent data for the system prompt. */
async function buildContext(userId: string): Promise<string> {
  const since = new Date(Date.now() - 14 * DAY_MS);
  const [snapshot, lastLog, metrics] = await Promise.all([
    prisma.readinessSnapshot.findFirst({
      where: { userId },
      orderBy: { date: "desc" },
      select: { score: true, date: true },
    }),
    prisma.dailyLog.findFirst({
      where: { userId },
      orderBy: { date: "desc" },
      select: { sleepHours: true, energy: true, mood: true, date: true },
    }),
    prisma.metric.findMany({
      where: { userId, recordedAt: { gte: since } },
      orderBy: { recordedAt: "desc" },
      select: { type: true, value: true },
      take: 80,
    }),
  ]);

  // Most recent value seen per metric type.
  const latest = new Map<string, number>();
  for (const m of metrics) if (!latest.has(m.type)) latest.set(m.type, m.value);

  const lines: string[] = [];
  lines.push(
    snapshot ? `Readiness (most recent): ${snapshot.score}/100.` : "Readiness: nothing scored yet.",
  );
  if (lastLog) {
    lines.push(
      `Last daily check-in: sleep ${Number(lastLog.sleepHours.toFixed(1))}h, energy ${lastLog.energy}/5, mood ${lastLog.mood}/5.`,
    );
  } else {
    lines.push("Daily check-in: none logged yet.");
  }
  for (const [type, value] of latest) {
    lines.push(`Latest ${METRIC_LABEL[type] ?? type.toLowerCase()}: ${Number(value.toFixed(1))}.`);
  }
  return lines.join("\n");
}

const ERR_REPLY = "I hit a snag reaching my brain just now. Give it a moment and try again.";

const NO_KEY_REPLY =
  "Your AI coach isn't switched on yet. Add a free Groq API key to the server (GROQ_API_KEY) — grab one at console.groq.com — and I'll start reading your BIOSYNC data and answering your questions. Until then, keep logging check-ins and metrics so there's plenty for me to work with.";

// ── Coach plan (AI trio · pillar #1) ─────────────────────────────────────────
const planInput = z.object({
  /** what the plan should lean toward */
  focus: z.enum(["training", "recovery", "balanced"]).default("balanced"),
});

/** A generated, non-diagnostic day plan; validated before it leaves the server. */
const planBlock = z.object({
  label: z.string().min(1).max(60),
  detail: z.string().min(1).max(600),
});
const planSchema = z.object({
  title: z.string().min(1).max(80),
  intro: z.string().min(1).max(400),
  blocks: z.array(planBlock).min(1).max(6),
});
export type Plan = z.infer<typeof planSchema>;

/** Parse the model's JSON into a validated Plan, or null when it isn't usable. */
export function parsePlan(raw: string): Plan | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = planSchema.safeParse(json);
  return result.success ? result.data : null;
}

const PLAN_SYSTEM = `You are the BIOSYNC Coach building a short, practical wellness plan for today, grounded in the user's own data below.

Rules:
- General wellness only. You are NOT a doctor: never diagnose, name conditions, prescribe, or give medical treatment. Keep movement/recovery/habit guidance gentle and reversible.
- Ground the plan in the user's actual numbers (readiness, sleep, energy, resting HR, HRV). If readiness or sleep is low, lean toward recovery.
- Reply with ONLY a JSON object, no prose around it, in exactly this shape:
  {"title": string, "intro": string (1-2 warm sentences), "blocks": [{"label": string, "detail": string}]}
- 3 to 5 blocks. Labels are short (e.g. "Move", "Fuel", "Recover", "Mind"). Details are 1-2 sentences, concrete and encouraging.`;

const PLAN_ERROR: Plan = {
  title: "Couldn’t build your plan",
  intro: "I hit a snag putting today’s plan together. Give it a moment and try again.",
  blocks: [{ label: "Try again", detail: "Tap regenerate — this is usually a brief network hiccup." }],
};

const PLAN_NO_KEY: Plan = {
  title: "Coach plan is off",
  intro: "Your AI coach isn’t switched on yet, so I can’t generate a plan.",
  blocks: [
    { label: "Switch it on", detail: "Add a free Groq API key (GROQ_API_KEY) to the server — grab one at console.groq.com." },
    { label: "Meanwhile", detail: "Keep logging check-ins and metrics so there’s plenty for me to work with." },
  ],
};

export const assistantRouter = router({
  /**
   * The morning digest: number-forward cards built from the user's real recent
   * data (last night's sleep, HRV / glucose / resting-HR trends, readiness).
   * Deterministic — no value is invented and nothing is sent to the LLM here; the
   * conversational follow-up happens through `chat` when the user taps a card.
   */
  digest: userProcedure.input(digestInput).query(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const today = input.today;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);
    const from = toDbDate(shiftDay(today, -6));
    const to = toDbDate(today);

    const [snaps, logs, metrics] = await Promise.all([
      prisma.readinessSnapshot.findMany({
        where: { userId, date: { gte: from, lte: to } },
        select: { date: true, score: true },
      }),
      prisma.dailyLog.findMany({
        where: { userId, date: { gte: from, lte: to } },
        select: { date: true, sleepHours: true, sleepQuality: true, energy: true, mood: true, weightKg: true },
      }),
      prisma.metric.findMany({
        where: {
          userId,
          type: { in: [MetricType.HRV, MetricType.GLUCOSE, MetricType.RESTING_HR] },
          recordedAt: { gte: twoWeeksAgo, lte: now },
        },
        orderBy: { recordedAt: "asc" },
        select: { type: true, value: true, recordedAt: true },
      }),
    ]);

    // Split each metric family into the last 7 days vs the 7 before, chronological.
    const window = (type: MetricType): MetricWindow => {
      const recent: number[] = [];
      const earlier: number[] = [];
      for (const m of metrics) {
        if (m.type !== type) continue;
        (m.recordedAt >= weekAgo ? recent : earlier).push(m.value);
      }
      return { recent, earlier };
    };

    return computeDigest({
      today,
      readiness: snaps.map((s) => ({ date: fromDbDate(s.date), score: s.score })),
      checkins: logs.map((r) => ({
        date: fromDbDate(r.date),
        sleepHours: r.sleepHours,
        sleepQuality: r.sleepQuality,
        energy: r.energy,
        mood: r.mood,
        weightKg: r.weightKg,
      })),
      hrv: window(MetricType.HRV),
      glucose: window(MetricType.GLUCOSE),
      restingHr: window(MetricType.RESTING_HR),
    });
  }),

  /**
   * Build a short, structured wellness plan for today, grounded in the user's
   * data and biased by `focus`. Non-diagnostic. Returns a validated Plan; on a
   * missing key / API error / unparseable model output it degrades to a friendly
   * placeholder plan so the sheet always has something to show.
   */
  plan: userProcedure.input(planInput).mutation(async ({ ctx, input }) => {
    if (!hasGroqKey()) return { plan: PLAN_NO_KEY, configured: false as const };
    const context = await buildContext(ctx.user.id);
    const result = await groqChat(
      [
        { role: "system", content: `${PLAN_SYSTEM}\n\n--- The user's current data ---\n${context}` },
        { role: "user", content: `Build me a ${input.focus} plan for today.` },
      ],
      { json: true },
    );
    // A rejected key is ours to fix and won't come right by retrying, so it
    // reads as "not switched on" rather than as a transient error.
    if (!result.ok) {
      return {
        plan: result.reason === "rejected" ? PLAN_NO_KEY : PLAN_ERROR,
        configured: result.reason !== "rejected",
      };
    }
    return { plan: parsePlan(result.content) || PLAN_ERROR, configured: true as const };
  }),

  /** Send the conversation; get one grounded, non-diagnostic reply back. */
  chat: userProcedure.input(chatInput).mutation(async ({ ctx, input }) => {
    if (!hasGroqKey()) {
      return { reply: NO_KEY_REPLY, configured: false as const };
    }
    const context = await buildContext(ctx.user.id);
    const result = await groqChat([
      { role: "system", content: `${SYSTEM}\n\n--- The user's current data ---\n${context}` },
      ...input.messages.map((m) => ({ role: m.role, content: m.content })),
    ]);
    if (!result.ok) {
      // A rejected key can't be retried into working, so say the coach is off
      // rather than inviting the user to try again forever.
      return {
        reply: result.reason === "rejected" ? NO_KEY_REPLY : ERR_REPLY,
        configured: result.reason !== "rejected",
      };
    }
    return { reply: result.content, configured: true as const };
  }),
});
