/**
 * Data layer for the AI Coach ("Ask"). Kept apart from the screen so the UI stays
 * presentation-only. Sends the running conversation to `assistant.chat`, which
 * grounds an LLM in the user's own BIOSYNC data and returns one reply. No health
 * values are logged here — the transcript lives only in component state.
 */
import { trpc } from "../../lib/trpc";

export type ChatRole = "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type ChatResult = {
  reply: string;
  /** false when the server has no Groq key yet (reply is the "not switched on" note). */
  configured: boolean;
};

/** Send the conversation so far (oldest → newest); resolve with one grounded reply. */
export async function sendChat(messages: ChatMessage[]): Promise<ChatResult> {
  const res = await trpc.assistant.chat.mutate({ messages });
  return { reply: res.reply, configured: res.configured };
}
