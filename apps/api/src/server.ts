/**
 * Standalone tRPC HTTP server, mounted at /trpc (matches the mobile client's
 * EXPO_PUBLIC_API_URL + "/trpc").
 */
import http from "node:http";
import type { ServerResponse } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router";
import { createContext } from "./context";
import { assertServerEnv, env } from "./env";

assertServerEnv();

const handler = createHTTPHandler({ router: appRouter, createContext });

// Auth travels in the Authorization header (Bearer), not cookies, so a wildcard
// origin is safe. Needed so the Expo *web* client (a browser, different origin)
// isn't blocked by CORS; native has no CORS and is unaffected.
function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.url && req.url.startsWith("/trpc")) {
    req.url = req.url.slice("/trpc".length) || "/";
    handler(req, res);
    return;
  }
  res.statusCode = 404;
  res.end("Not Found");
});

server.listen(env.PORT, () => {
  console.log(`⚡ Pulse API listening on http://localhost:${env.PORT}/trpc`);
});
