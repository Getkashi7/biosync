import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { servePrivacy } from "../lib/privacy";

/** Minimal response double — records what the handler wrote. */
function fakeRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    end(body?: string) {
      res.body = body ?? "";
    },
    body: "",
    headers,
  };
  return res;
}

function serve(url: string | undefined) {
  const res = fakeRes();
  const handled = servePrivacy({ url } as IncomingMessage, res as unknown as ServerResponse);
  return { handled, res };
}

describe("servePrivacy", () => {
  it("serves the policy at /privacy", () => {
    const { handled, res } = serve("/privacy");
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(res.body).toContain("<html");
  });

  it("serves the same page at the /privacy.html alias", () => {
    const { handled, res } = serve("/privacy.html");
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  // A link from a store listing or an email arrives with tracking params.
  // Comparing the whole URL used to 404 those.
  it("ignores a query string when matching", () => {
    const { handled, res } = serve("/privacy?utm_source=play-store");
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it("declines any other path, leaving it to the tRPC handler", () => {
    for (const url of ["/health", "/trpc/user.me", "/privacypolicy", "/"]) {
      expect(serve(url).handled).toBe(false);
    }
  });

  it("declines a request with no url rather than throwing", () => {
    expect(serve(undefined).handled).toBe(false);
  });
});
