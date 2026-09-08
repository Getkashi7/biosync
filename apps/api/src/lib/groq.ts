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

/**
 * The chat model, overridable with GROQ_MODEL.
 *
 * Groq retires models, and a decommissioned one fails exactly like a bad key
 * from the app's side — which is how `llama-3.3-70b-versatile` sat here after
 * Groq dropped it, quietly breaking every AI feature.
 *
 * qwen3.8-27b was chosen by testing what the app actually needs against every
 * model the account can see: it answers JSON mode correctly (~370ms) and plain
 * chat (~450ms). The `openai/gpt-oss-*` models were rejected — they return
 * HTTP 400 "Failed to generate JSON" on the estimator's prompt, so they cannot
 * do the one job nutrition needs.
 *
 * If AI features stop working, check this model still exists before anything
 * else: `curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models`
 */
export const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

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
 * A misconfiguration fails identically on every request, so log it once rather
 * than on every meal anyone logs. Reset on success, so a fix goes quiet and a
 * fresh break is reported again.
 */
let warnedRejected = false;

function warnOnce(message: string): void {
  if (warnedRejected) return;
  warnedRejected = true;
  console.error(message);
}

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
      warnOnce(`[groq] key rejected (HTTP ${res.status}) — AI features are off until it is replaced`);
      return { ok: false, reason: "rejected" };
    }
    // A retired model looks identical to a bad key from the app's side, and is
    // just as permanent: `llama-3.3-70b-versatile` sat in this file after Groq
    // dropped it, silently breaking every AI feature. Say which model.
    if (res.status === 404) {
      warnOnce(`[groq] model "${GROQ_MODEL}" was not found — it may have been retired`);
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
