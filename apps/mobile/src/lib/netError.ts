/**
 * Telling "you're offline" apart from "the server broke".
 *
 * Both arrive at a screen as a rejected promise, but they mean different things
 * to the person reading the message: one is fixed by walking to a window, the
 * other isn't fixable by them at all. Saying "check your connection" to someone
 * whose connection is fine is just as wrong as saying "something went wrong" to
 * someone in a lift.
 *
 * This deliberately does NOT use NetInfo. That's a native module, so it would
 * force another dev-client rebuild, and it answers a slightly different
 * question ("is there a network interface up?") than the one that matters here
 * ("did this request reach the server?"). A phone on hotel wi-fi with no route
 * out is "connected" to NetInfo and offline to the user. A proactive banner
 * does want NetInfo — that can ride along with the push-notification rebuild,
 * where a native build is already required.
 *
 * Classification is by several independent signals because no single one is
 * reliable across RN versions and platforms.
 */

export type NetFailure = "offline" | "error";

/** Messages React Native's fetch produces when the request never left. */
const TRANSPORT_HINTS = [
  "network request failed",
  "unable to resolve host",
  "failed to connect",
  "connection refused",
  "software caused connection abort",
  "timeout",
  "timed out",
];

function messagesOf(err: unknown, depth = 0): string[] {
  if (depth > 3 || err === null || typeof err !== "object") return [];
  const out: string[] = [];
  const e = err as { message?: unknown; cause?: unknown };
  if (typeof e.message === "string") out.push(e.message.toLowerCase());
  // tRPC wraps the transport error; the useful text is usually one level down.
  if (e.cause !== undefined) out.push(...messagesOf(e.cause, depth + 1));
  return out;
}

/**
 * Whether the server was ever reached.
 *
 * A TRPCClientError raised from a server *response* carries `data` (it has an
 * httpStatus, a code, and so on). A transport failure has nothing to carry, so
 * a null/undefined `data` alongside no HTTP status is a strong signal that the
 * request never got an answer.
 */
function reachedServer(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const e = err as { data?: unknown; shape?: unknown };
  return (e.data !== null && e.data !== undefined) || (e.shape !== null && e.shape !== undefined);
}

/** Classify a rejected request so the UI can say something true about it. */
export function classifyNetError(err: unknown): NetFailure {
  // If the server answered — even with a 500 — connectivity is not the problem.
  if (reachedServer(err)) return "error";

  const msgs = messagesOf(err);
  if (msgs.some((m) => TRANSPORT_HINTS.some((h) => m.includes(h)))) return "offline";

  // RN's fetch rejects with a bare TypeError when the request can't be made.
  if (err instanceof TypeError) return "offline";

  // Nothing reached the server and nothing identifies why. "Offline" is the
  // better guess: it's the common case on a phone, and it points at something
  // the user can actually check.
  return "offline";
}
