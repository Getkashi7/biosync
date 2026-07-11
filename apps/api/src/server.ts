/**
 * Standalone tRPC HTTP server, mounted at /trpc (matches the mobile client's
 * EXPO_PUBLIC_API_URL + "/trpc").
 */
import http from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router";
import { createContext } from "./context";
import { assertServerEnv, env } from "./env";

assertServerEnv();

const handler = createHTTPHandler({ router: appRouter, createContext });

const server = http.createServer((req, res) => {
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
