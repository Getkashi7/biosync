import { describe, expect, it } from "vitest";
import { RateLimiter, clientKey } from "../lib/rateLimit";

describe("RateLimiter", () => {
  it("allows requests up to the limit", () => {
    const limiter = new RateLimiter(3, 1000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 1).allowed).toBe(true);
    expect(limiter.check("a", 2).allowed).toBe(true);
  });

  it("blocks the request that exceeds the limit", () => {
    const limiter = new RateLimiter(2, 1000);
    limiter.check("a", 0);
    limiter.check("a", 0);
    const third = limiter.check("a", 0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSec).toBe(1);
  });

  it("keeps callers isolated from each other", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 0).allowed).toBe(false);
    // A different caller must not inherit the first one's budget.
    expect(limiter.check("b", 0).allowed).toBe(true);
  });

  it("lets a blocked caller through once the window rolls over", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 500).allowed).toBe(false);
    expect(limiter.check("a", 1000).allowed).toBe(true);
  });

  it("rounds retryAfter up so a caller never retries too early", () => {
    const limiter = new RateLimiter(1, 1000);
    limiter.check("a", 0);
    // 100ms into the window: 900ms remain, which must report as 1s, not 0.
    expect(limiter.check("a", 100).retryAfterSec).toBe(1);
  });

  it("evicts expired windows so the map cannot grow without bound", () => {
    const limiter = new RateLimiter(5, 1000);
    for (let i = 0; i < 50; i++) limiter.check(`ip-${i}`, 0);
    expect(limiter.size).toBe(50);

    // A later request past the window triggers the sweep.
    limiter.check("fresh", 5000);
    expect(limiter.size).toBe(1);
  });
});

describe("clientKey", () => {
  it("prefers the left-most forwarded-for entry (the real client behind a proxy)", () => {
    expect(clientKey("203.0.113.7, 70.41.3.18", "10.0.0.1")).toBe("203.0.113.7");
  });

  it("trims whitespace", () => {
    expect(clientKey("  203.0.113.7 ", undefined)).toBe("203.0.113.7");
  });

  it("handles a repeated header arriving as an array", () => {
    expect(clientKey(["203.0.113.7", "198.51.100.2"], "10.0.0.1")).toBe("203.0.113.7");
  });

  it("falls back to the socket address when the header is absent", () => {
    expect(clientKey(undefined, "10.0.0.1")).toBe("10.0.0.1");
  });

  it("falls back to a constant when nothing identifies the caller", () => {
    // Everything unattributable shares one bucket — deliberately conservative.
    expect(clientKey(undefined, undefined)).toBe("unknown");
    expect(clientKey("", undefined)).toBe("unknown");
  });
});
