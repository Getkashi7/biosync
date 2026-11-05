/**
 * The legal pages, served from the API so there's no external static-hosting
 * dependency: the privacy policy and the account-deletion instructions. Both
 * HTML files live in the repo root; this handler reads them and returns them
 * with the correct content-type.
 *
 * Both are store requirements, not decoration — Play Console asks for a privacy
 * policy URL and a route to request account deletion, and both have to answer
 * for a reviewer who is not signed in. That is also why they are two files
 * rather than one page with an anchor: a URL with a `#fragment` is not a
 * separate destination, and the deletion URL has to stand on its own.
 *
 * Whatever is added here must also be copied into the image — `apps/api/
 * Dockerfile` copies these files by name, so a new page that isn't listed
 * there serves a 500 in production and 200 locally, which is the worst way to
 * find out.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Which URL serves which file. The `.html` aliases exist because both forms get
 * pasted into store consoles and emails, and a 404 on one of them is a rejected
 * submission.
 */
const PAGES: Record<string, string> = {
  "/privacy": "privacy.html",
  "/privacy.html": "privacy.html",
  "/delete-account": "delete-account.html",
  "/delete-account.html": "delete-account.html",
};

/**
 * Resolved paths, remembered per file: the pages ship inside the image, so a
 * path can't change while the process lives. Only hits are cached — a miss
 * stays retryable rather than poisoning every later request.
 */
const cache = new Map<string, string>();

function findPage(fileName: string): string | null {
  const hit = cache.get(fileName);
  if (hit) return hit;

  const candidates = [
    path.resolve(__dirname, "../../../../", fileName),
    path.resolve(__dirname, "../../../../../", fileName),
    path.resolve("/app", fileName),
    path.resolve(process.cwd(), fileName),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      cache.set(fileName, p);
      return p;
    }
  }
  return null;
}

export function serveLegal(req: IncomingMessage, res: ServerResponse): boolean {
  // Compare the path alone: a link from a store listing or an email arrives
  // with tracking params (`/privacy?utm_source=...`), and comparing the whole
  // URL would 404 it.
  const pathname = (req.url ?? "").split("?")[0] ?? "";
  const fileName = PAGES[pathname];
  if (!fileName) return false;

  const filePath = findPage(fileName);
  if (!filePath) {
    console.error(`[legal] ${fileName} not found in any expected location`);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Page not found" }));
    return true;
  }

  try {
    const html = readFileSync(filePath, "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
    return true;
  } catch (err) {
    console.error(`[legal] failed to read ${fileName}:`, err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Page not found" }));
    return true;
  }
}
