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
import { Role } from "@prisma/client";
import { router, requireRole } from "../trpc";
import { prisma } from "../db";
import { env } from "../env";

const userProcedure = requireRole(Role.USER);

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Groq's free-tier chat model (OpenAI-compatible). Override via GROQ_MODEL. */
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const ERR_REPLY = "I hit a snag reaching my brain just now. Give it a moment and try again.";

const NO_KEY_REPLY =
  "Your AI coach isn't switched on yet. Add a free Groq API key to the server (GROQ_API_KEY) — grab one at console.groq.com — and I'll start reading your BIOSYNC data and answering your questions. Until then, keep logging check-ins and metrics so there's plenty for me to work with.";

export const assistantRouter = router({
  /** Send the conversation; get one grounded, non-diagnostic reply back. */
  chat: userProcedure.input(chatInput).mutation(async ({ ctx, input }) => {
    if (!env.GROQ_API_KEY) {
      return { reply: NO_KEY_REPLY, configured: false as const };
    }
    try {
      const context = await buildContext(ctx.user.id);
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          max_tokens: 1024,
          messages: [
            { role: "system", content: `${SYSTEM}\n\n--- The user's current data ---\n${context}` },
            ...input.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      if (!res.ok) return { reply: ERR_REPLY, configured: true as const };
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const reply = (data.choices?.[0]?.message?.content ?? "").trim();
      return {
        reply: reply || "I couldn't put that into words just now — try asking a different way?",
        configured: true as const,
      };
    } catch {
      // Network / rate-limit / transient API errors: keep the chat usable.
      return { reply: ERR_REPLY, configured: true as const };
    }
  }),
});
