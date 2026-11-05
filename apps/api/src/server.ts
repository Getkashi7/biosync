/**
 * Entry point: check the environment, bind the port, say what this deploy can
 * and cannot do, and stop cleanly when the platform says to.
 *
 * The HTTP surface itself — the origin allowlist, the rate limit, the body cap,
 * /health and /trpc — lives in `app.ts`, so it can be tested without a
 * listener. This file is the part that only makes sense in a real process.
 */
import { createApiServer } from "./app";
import { assertServerEnv, allowedOrigins, env, isProduction, reportFeatureConfig } from "./env";

assertServerEnv();

const server = createApiServer();

server.listen(env.PORT, env.HOST, () => {
  // No request data here — only that the process is up.
  console.log(`⚡ Pulse API listening on ${env.HOST}:${env.PORT}/trpc (${env.NODE_ENV})`);
  // Say what this deploy cannot do, at the one moment someone is reading the log.
  reportFeatureConfig();
  if (isProduction && allowedOrigins.length === 0) {
    console.warn("ALLOWED_ORIGINS is unset — browser requests from any origin are accepted.");
  }
});

/**
 * Last line of defence for the process.
 *
 * An exception thrown from inside an I/O event handler — a `data` listener, a
 * `then` with no `catch` — unwinds past the request that caused it and takes
 * the whole API down with it, for every user. That is exactly how the old body
 * guard became a remote kill switch (see `maxBodySize` in `app.ts`). That guard
 * is fixed; the *class* of bug isn't, and the next one should cost one request,
 * not the service.
 *
 * Node's own advice is that a process may be in an undefined state after an
 * uncaught exception, and the textbook answer is to exit and let the supervisor
 * restart. Not here, deliberately: this runs as a single free-tier instance
 * whose restart is a ~30-second cold start for whoever is mid-check-in, so an
 * exit turns one bad request into an outage — and, if the trigger is remotely
 * reachable, into a repeatable one. Staying up and shouting is the better trade
 * at this size. Revisit it on more than one instance.
 *
 * Only the message is logged, never the error object or the request: a thrown
 * value can carry a token or a health value, and neither belongs in a log.
 */
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaught exception — the process stays up:", err instanceof Error ? err.message : err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandled rejection — the process stays up:", reason instanceof Error ? reason.message : reason);
});

/** Let the platform stop us cleanly on deploy rather than cutting connections. */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
