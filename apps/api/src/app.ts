/**
 * The API's HTTP surface, as a factory.
 *
 * This process is internet-facing, so the plain tRPC handler is wrapped in
 * three guards before it ever sees a request: an origin allowlist, a per-IP
 * rate limit, and a body cap. Plus /health for the platform's probe.
 *
 * Split out of `server.ts` so those guards can be driven by real requests in a
 * test without binding a port or requiring secrets — the body cap in
 * particular, because the hand-rolled version of it could kill the process
 * (see `maxBodySize` below). `server.ts` is still the entry point; it is the
 * only thing that listens.
 */
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router";
import { createContext } from "./context";
import { allowedOrigins, featureConfig } from "./env";
import { RateLimiter, clientKey } from "./lib/rateLimit";
import { prisma } from "./db";
import { servePrivacy } from "./lib/privacy";
import { probeStorage } from "./lib/storage";

/** Largest request we'll accept. Payloads here are check-ins and chat turns. */
export const MAX_BODY_BYTES = 256 * 1024;

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
 * Reject a request that *declares* an oversized body, before a byte of it is
 * read. The real cap is `maxBodySize` on the tRPC handler below; this is the
 * cheap half, and it's what an honest client gets a clean 413 from.
 */
function withinDeclaredBodyLimit(req: IncomingMessage, res: ServerResponse): boolean {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY_BYTES) {
    send(res, 413, JSON.stringify({ error: "Payload too large" }));
    return false;
  }
  return true;
}

/**
 * Build the server. Each call gets its own rate-limit state, so tests are
 * independent of each other.
 */
export function createApiServer(): http.Server {
  const handler = createHTTPHandler({
    router: appRouter,
    createContext,
    /**
     * The body cap that actually holds, enforced inside the adapter.
     *
     * This used to be a hand-rolled stream guard: a `data` listener counting
     * bytes that sent 413 and destroyed the request once the total passed the
     * cap. It was a remote kill switch. `data` keeps firing for chunks already
     * in flight, so the listener ran again after that response had ended,
     * `res.setHeader` threw ERR_HTTP_HEADERS_SENT from inside an event
     * handler, nothing caught it, and the process exited — the whole API, for
     * every user, from one unauthenticated request with a chunked body and no
     * Content-Length. Reproduced on Node 20 (what the image runs) against this
     * repo's own @trpc/server; `bodyLimit.test.ts` is the regression guard.
     *
     * `maxBodySize` does the same job where the body is actually consumed: it
     * stops reading at the cap and answers 413 without touching a response
     * that has already finished.
     */
    maxBodySize: MAX_BODY_BYTES,
  });

  /** Per-IP cap. Generous for a real session, cheap against a script. */
  const limiter = new RateLimiter(300, 60_000);

  return http.createServer((req, res) => {
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
     * Does the bucket actually accept this deploy's credentials?
     *
     * `/health/config` only says a key is *present*. That proved not to be the
     * same thing: it reported storage configured while every upload died at the
     * first hop, and the reason was in a deploy log that needs dashboard access
     * to read. This closes that gap — it reports the upstream status code, so
     * "the key is missing", "the key is rejected" and "the bucket is gone" stop
     * looking identical from outside.
     *
     * Below the rate limiter, like `/health/db` and for the same reason: it makes
     * an outbound request, so it must not be usable to hammer Supabase. Returns a
     * status and a short upstream reason — never the URL, the token or the key.
     */
    if (req.url === "/health/storage") {
      void probeStorage()
        .then((r) => send(res, r.ok ? 200 : 503, JSON.stringify({ ok: r.ok, storage: r })))
        .catch(() => send(res, 503, JSON.stringify({ ok: false, storage: { reason: "probe failed" } })));
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
      if (!withinDeclaredBodyLimit(req, res)) return;
      req.url = req.url.slice("/trpc".length) || "/";
      handler(req, res);
      return;
    }

    send(res, 404, JSON.stringify({ error: "Not Found" }));
  });
}
