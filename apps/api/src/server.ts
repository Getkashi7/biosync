/**
 * Standalone tRPC HTTP server, mounted at /trpc (matches the mobile client's
 * EXPO_PUBLIC_API_URL + "/trpc").
 *
 * This process is internet-facing, so the plain handler is wrapped in three
 * guards before it ever sees a request: an origin allowlist, a per-IP rate
 * limit, and a request-body cap. Plus /health for the platform's probe.
 */
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router";
import { createContext } from "./context";
import { assertServerEnv, allowedOrigins, env, featureConfig, isProduction, reportFeatureConfig } from "./env";
import { RateLimiter, clientKey } from "./lib/rateLimit";
import { prisma } from "./db";
import { servePrivacy } from "./lib/privacy";

assertServerEnv();

const handler = createHTTPHandler({ router: appRouter, createContext });

/** Largest request we'll accept. Payloads here are check-ins and chat turns. */
const MAX_BODY_BYTES = 256 * 1024;

/** Per-IP cap. Generous for a real session, cheap against a script. */
const limiter = new RateLimiter(300, 60_000);

/**
 * Auth travels in the Authorization header (Bearer), never cookies, so an
 * origin can't be used to ride an existing session — the wildcard that was here
 * was defensible. It's still narrowed in production: an allowlist costs nothing
 * and keeps other people's web pages from calling this API in a browser.
 *
 * Native clients send no Origin header at all, so they never match a branch
 * here and are unaffected by any of it.
 */
function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");

  if (origin !== undefined) {
    const permitted = allowedOrigins.length === 0 || allowedOrigins.includes(origin);
    if (!permitted) return false;
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (allowedOrigins.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Max-Age", "86400");
  return true;
}

function send(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(body);
}

/**
 * Reject oversized bodies. Content-Length catches the honest case; the stream
 * guard catches a chunked upload that never declares a length, so neither can
 * buffer unbounded memory inside the tRPC adapter.
 */
function withinBodyLimit(req: IncomingMessage, res: ServerResponse): boolean {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY_BYTES) {
    send(res, 413, JSON.stringify({ error: "Payload too large" }));
    return false;
  }

  let seen = 0;
  req.on("data", (chunk: Buffer) => {
    seen += chunk.length;
    if (seen > MAX_BODY_BYTES) {
      send(res, 413, JSON.stringify({ error: "Payload too large" }));
      req.destroy();
    }
  });
  return true;
}

const server = http.createServer((req, res) => {
  if (!applyCors(req, res)) {
    send(res, 403, JSON.stringify({ error: "Origin not allowed" }));
    return;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Liveness only — deliberately no DB call, so a probe can't be turned into a
  // way to hammer Postgres, and a slow database doesn't get the app restarted.
  if (req.url === "/health") {
    send(res, 200, JSON.stringify({ ok: true }));
    return;
  }

  /**
   * Which optional features this deploy can actually serve.
   *
   * Exists because photo upload shipped broken and stayed broken: the storage
   * key was declared in render.yaml, never filled in on the dashboard, and the
   * only symptom was an opaque error when a user tapped "add photo". There was
   * no way to ask the running service what it was configured for without
   * dashboard access.
   *
   * Booleans only, and never the values — this is unauthenticated, so it must
   * reveal that a key is *present*, never what it is, and never which of two
   * variables was the missing one beyond the feature it powers.
   */
  if (req.url === "/health/config") {
    send(res, 200, JSON.stringify({ ok: true, features: featureConfig() }));
    return;
  }

  if (servePrivacy(req, res)) return;

  const { allowed, retryAfterSec } = limiter.check(
    clientKey(req.headers["x-forwarded-for"], req.socket.remoteAddress),
  );
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSec));
    send(res, 429, JSON.stringify({ error: "Too many requests" }));
    return;
  }

  /**
   * Keep-alive for the database, distinct from `/health` above.
   *
   * Supabase's free tier pauses a project after ~7 days with no DATABASE
   * activity, and `/health` deliberately never queries Postgres — so an uptime
   * pinger keeps the API awake while the database quietly pauses underneath
   * it. This endpoint exists to be called RARELY (daily is plenty) by a
   * scheduled ping, purely so the project counts as active.
   *
   * Deliberately below the rate limiter, unlike `/health`: it touches the
   * database, so it must not be usable as a way to hammer Postgres.
   */
  if (req.url === "/health/db") {
    void prisma
      .$queryRaw`select 1`
      .then(() => send(res, 200, JSON.stringify({ ok: true, db: "reachable" })))
      .catch(() => send(res, 503, JSON.stringify({ ok: false, db: "unreachable" })));
    return;
  }

  if (req.url && req.url.startsWith("/trpc")) {
    if (!withinBodyLimit(req, res)) return;
    req.url = req.url.slice("/trpc".length) || "/";
    handler(req, res);
    return;
  }

  send(res, 404, JSON.stringify({ error: "Not Found" }));
});

server.listen(env.PORT, env.HOST, () => {
  // No request data here — only that the process is up.
  console.log(`⚡ Pulse API listening on ${env.HOST}:${env.PORT}/trpc (${env.NODE_ENV})`);
  // Say what this deploy cannot do, at the one moment someone is reading the log.
  reportFeatureConfig();
  if (isProduction && allowedOrigins.length === 0) {
    console.warn("ALLOWED_ORIGINS is unset — browser requests from any origin are accepted.");
  }
});

/** Let the platform stop us cleanly on deploy rather than cutting connections. */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
