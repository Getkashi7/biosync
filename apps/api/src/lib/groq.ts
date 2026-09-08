/**
 * Minimal Groq client shared by the AI features (coach chat, plans, macro
 * estimates). Groq's chat-completions endpoint is OpenAI-compatible, so this is
 * a plain `fetch` — no SDK.
 *
 * It never throws and never logs message content (which carries health data).
 * It does, however, distinguish WHY a call failed. Collapsing every failure to
 * `null` hid a real problem for a long time: an invalid key returns 401 on
 * every request, and the app quietly told users "couldn't reach the coach" —
 * blaming the network for what was a configuration error nobody could see,
 * because nothing was logged either.
 *
 * So: a rejected key is loud on the server (once, without the key itself), and
 * callers get a reason they can turn into copy that is actually true.
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
 * Why a completion didn't come back.
 *
 * The distinction that matters to a user is permanence: `unconfigured` and
 * `rejected` are ours to fix and will not resolve by waiting, while
 * `rate_limited` and `unavailable` will. Copy should never invite someone to
 * retry something that cannot succeed.
 */
export type GroqFailure = "unconfigured" | "rejected" | "rate_limited" | "unavailable";

export type GroqResult =
  | { ok: true; content: string }
  | { ok: false; reason: GroqFailure };

/**
 * A rejected key fails identically on every request, so log it once rather
 * than on every meal anyone logs. Reset on success, so a fixed key goes quiet
 * and a re-broken one is reported again.
 */
let warnedRejected = false;

/**
 * One chat completion. `json: true` asks Groq for a JSON object back (the
 * prompt must also say so).
 */
export async function groqChat(
  messages: GroqMessage[],
  opts: { maxTokens?: number; json?: boolean } = {},
): Promise<GroqResult> {
  if (!env.GROQ_API_KEY) return { ok: false, reason: "unconfigured" };
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

    if (res.status === 401 || res.status === 403) {
      // Never the key itself, and never the request body — that carries health
      // data. Only the fact that Groq is refusing us.
      if (!warnedRejected) {
        warnedRejected = true;
        console.error(
          `[groq] key rejected (HTTP ${res.status}) — AI features are off until it is replaced`,
        );
      }
      return { ok: false, reason: "rejected" };
    }
    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    if (!res.ok) return { ok: false, reason: "unavailable" };

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!content) return { ok: false, reason: "unavailable" };

    warnedRejected = false;
    return { ok: true, content };
  } catch {
    // Never left the machine, or never came back — transient either way.
    return { ok: false, reason: "unavailable" };
  }
}

/** Test seam — clears the once-only warning between cases. */
export function __resetGroqWarning(): void {
  warnedRejected = false;
}
