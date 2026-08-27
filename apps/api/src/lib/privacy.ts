/**
 * Privacy policy page — served directly from the API so there's no external
 * static-hosting dependency. The HTML lives in the repo root as privacy.html;
 * this handler reads it and returns it with the correct content-type.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findPrivacyHtml(): string | null {
  const candidates = [
    path.resolve(__dirname, "../../../../privacy.html"),
    path.resolve(__dirname, "../../../../../privacy.html"),
    path.resolve("/app/privacy.html"),
    path.resolve(process.cwd(), "privacy.html"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function servePrivacy(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.url !== "/privacy") return false;

  const filePath = findPrivacyHtml();
  if (!filePath) {
    console.error("[privacy] privacy.html not found in any expected location");
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Privacy policy not found" }));
    return true;
  }

  try {
    const html = readFileSync(filePath, "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
    return true;
  } catch (err) {
    console.error("[privacy] failed to read privacy.html:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Privacy policy not found" }));
    return true;
  }
}
