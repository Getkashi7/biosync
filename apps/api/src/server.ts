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
import { assertServerEnv, allowedOrigins, env, isProduction } from "./env";
import { RateLimiter, clientKey } from "./lib/rateLimit";
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

  if (servePrivacy(req, res)) return;

  const { allowed, retryAfterSec } = limiter.check(
    clientKey(req.headers["x-forwarded-for"], req.socket.remoteAddress),
  );
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSec));
    send(res, 429, JSON.stringify({ error: "Too many requests" }));
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
