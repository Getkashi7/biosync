import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { serveLegal } from "../lib/legal";

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
  const handled = serveLegal({ url } as IncomingMessage, res as unknown as ServerResponse);
  return { handled, res };
}

describe("the privacy policy", () => {
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

/**
 * Play Console wants a URL where someone can find out how to delete their
 * account, and it has to answer for a reviewer who is not signed in — so this
 * is a page, not a screen behind the login.
 */
describe("the account-deletion page", () => {
  it("serves it at /delete-account", () => {
    const { handled, res } = serve("/delete-account");
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(res.body).toContain("<html");
  });

  it("serves the same page at the /delete-account.html alias", () => {
    expect(serve("/delete-account.html").res.statusCode).toBe(200);
  });

  it("ignores a query string, like the policy does", () => {
    expect(serve("/delete-account?utm_source=play-store").res.statusCode).toBe(200);
  });

  it("is a different page from the policy", () => {
    expect(serve("/delete-account").res.body).not.toBe(serve("/privacy").res.body);
  });

  /**
   * The page tells people where the button is and what deletion costs them.
   * `account.deleteAccount` purges stored images, wipes the audit trail and
   * drops every owned row, and `ProfileScreen` puts the button under "Account"
   * on the You tab — if any of that moves, this page is lying to someone about
   * their own health records, so these are the claims worth pinning.
   */
  it("states the real in-app route and the real retention", () => {
    const body = serve("/delete-account").res.body;
    expect(body).toContain("You");
    expect(body).toContain("Delete account");
    // The encrypted-backup tail, matching the privacy policy's section 8.
    expect(body).toContain("90 days");
    expect(body).toContain("biosync.privacy@gmail.com");
  });

  it("does not promise that anything else survives the delete", () => {
    // The audit trail IS deleted with the account (account.ts deletes rows
    // where the user is actor, subject or entity), so the page must not imply
    // a retained access record.
    expect(serve("/delete-account").res.body).not.toMatch(/access record.{0,40}(kept|retain)/i);
  });
});
