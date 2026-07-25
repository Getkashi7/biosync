/**
 * A small fixed-window rate limiter, in memory.
 *
 * The API is about to become internet-facing, and every procedure sits behind a
 * Supabase JWT — but the *unauthenticated* surface (anyone POSTing to /trpc) is
 * reachable by definition, and each request costs a JWT verification plus at
 * least one Postgres round-trip. This caps that.
 *
 * Deliberately in-process: state is per instance, so N instances allow N× the
 * limit. That's an accepted trade for now — it's a blunt abuse guard, not a
 * quota system. If the API ever scales past one or two instances, move this to
 * Redis rather than tightening the numbers.
 *
 * Never logs the key (an IP is personal data).
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the current window resets — for the Retry-After header. */
  retryAfterSec: number;
};

type Window = { count: number; resetAt: number };

export class RateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #hits = new Map<string, Window>();
  #lastSweep = 0;

  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  /** Count one request against `key`, and say whether it may proceed. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    this.#sweep(now);

    const existing = this.#hits.get(key);
    if (!existing || now >= existing.resetAt) {
      this.#hits.set(key, { count: 1, resetAt: now + this.#windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }

    existing.count += 1;
    if (existing.count > this.#limit) {
      return { allowed: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  /** Number of keys currently tracked — for tests. */
  get size(): number {
    return this.#hits.size;
  }

  /**
   * Drop expired windows so the map can't grow without bound under a spray of
   * one-off source addresses. Amortised: at most once per window.
   */
  #sweep(now: number): void {
    if (now - this.#lastSweep < this.#windowMs) return;
    this.#lastSweep = now;
    for (const [key, win] of this.#hits) {
      if (now >= win.resetAt) this.#hits.delete(key);
    }
  }
}

/**
 * Best-effort client address. Behind Fly/Railway the socket peer is the proxy,
 * so the left-most `x-forwarded-for` entry is the real client. Falls back to the
 * socket address when the header is absent (direct connections, local dev).
 *
 * Spoofable when the app is reachable without the proxy in front — acceptable
 * for a rate-limit key, and the reason this is not used for anything else.
 */
export function clientKey(forwardedFor: string | string[] | undefined, socketAddr: string | undefined): string {
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const first = raw?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : (socketAddr ?? "unknown");
}
