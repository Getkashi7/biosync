/**
 * Minimal Groq client shared by the AI features (coach chat, plans, macro
 * estimates). Groq's chat-completions endpoint is OpenAI-compatible, so this is
 * a plain `fetch` — no SDK.
 *
 * It never throws and never logs message content (which carries health data):
 * every failure — missing key, non-2xx, rate limit, network, empty choice —
 * collapses to `null`, and each caller decides how to degrade gracefully.
 */
import { env } from "../env";

/** Groq's free-tier chat model. Override with GROQ_MODEL. */
export const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

/** Whether a key is configured — lets callers show "not switched on yet" copy. */
export function hasGroqKey(): boolean {
  return Boolean(env.GROQ_API_KEY);
}

/**
 * One chat completion. Returns the assistant's text, or null on any failure.
 * `json: true` asks Groq for a JSON object back (the prompt must also say so).
 */
export async function groqChat(
  messages: GroqMessage[],
  opts: { maxTokens?: number; json?: boolean } = {},
): Promise<string | null> {
  if (!env.GROQ_API_KEY) return null;
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        messages,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = (data.choices?.[0]?.message?.content ?? "").trim();
    return content || null;
  } catch {
    // Network / rate-limit / transient errors — the caller degrades gracefully.
    return null;
  }
}
