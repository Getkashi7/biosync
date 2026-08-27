/**
 * Privacy policy page — served directly from the API so there's no external
 * static-hosting dependency. The HTML lives in the repo root as privacy.html;
 * this handler reads it and returns it with the correct content-type.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVACY_PATH = path.resolve(__dirname, "../../../../privacy.html");

export function servePrivacy(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.url !== "/privacy") return false;

  try {
    const html = readFileSync(PRIVACY_PATH, "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
    return true;
  } catch {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Privacy policy not found" }));
    return true;
  }
}
