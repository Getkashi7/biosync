/**
 * Stripe reads, and the three ways they can fail.
 *
 * The distinction these pin is the one `lib/groq.ts` paid for the hard way: an
 * invalid key returns 401 on every single request, so presenting it as a
 * transient failure invites someone to retry forever a thing that can never
 * succeed. Unconfigured and rejected are permanent; a 5xx is not.
 *
 * The first test is the load-bearing one. `new Stripe("")` throws, so importing
 * this module without a key must not construct a client — otherwise every run
 * of a suite that is deliberately credential-free would fail on import.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const OLD = { ...process.env };

const subscriptionsList = vi.fn();
const paymentIntentsList = vi.fn();
const construct = vi.fn();

vi.mock("stripe", () => ({
  default: class {
    subscriptions = { list: (...a: unknown[]) => subscriptionsList(...a) };
    paymentIntents = { list: (...a: unknown[]) => paymentIntentsList(...a) };
    constructor(key: string) {
      construct(key);
      // The real SDK throws on an empty key; mirror that so the lazy-
      // construction guard below is testing something real.
      if (!key) throw new Error("Neither apiKey nor config.authenticator provided");
    }
  },
}));

/** An async iterable, which is what the SDK's auto-pagination returns. */
function pages<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const i of items) yield i;
    },
  };
}

function sub(over: Record<string, unknown> = {}) {
  return {
    status: "active",
    items: {
      data: [
        {
          quantity: 1,
          price: { unit_amount: 1000, currency: "gbp", recurring: { interval: "month", interval_count: 1 } },
        },
      ],
    },
    ...over,
  };
}

async function load(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = key;
  return import("../lib/stripe");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  subscriptionsList.mockReturnValue(pages([]));
  paymentIntentsList.mockReturnValue(pages([]));
});

afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
});

describe("lazy construction", () => {
  /**
   * The guard that keeps `pnpm test` credential-free. If the client were built
   * at module scope, this import alone would throw.
   */
  it("importing with no key does not construct a client, and does not throw", async () => {
    const m = await load(undefined);
    expect(construct).not.toHaveBeenCalled();
    expect(m.stripeConfigured()).toBe(false);
    expect(m.getStripe()).toBeNull();
  });

  it("builds the client once, on first use", async () => {
    const m = await load("sk_test_abc");
    expect(construct).not.toHaveBeenCalled();
    m.getStripe();
    m.getStripe();
    expect(construct).toHaveBeenCalledTimes(1);
  });
});

describe("mode", () => {
  // An admin looking at "£0 MRR" needs to know whether they are reading the
  // test books. This is why it rides on the authed surface and not on
  // /health/config, which is unauthenticated and booleans-only.
  it("distinguishes live from test, and is null when unconfigured", async () => {
    expect((await load("sk_live_abc")).stripeMode()).toBe("live");
    expect((await load("sk_test_abc")).stripeMode()).toBe("test");
    expect((await load(undefined)).stripeMode()).toBeNull();
  });
});

describe("fetchRevenue", () => {
  it("is unconfigured, not empty, when there is no key", async () => {
    const m = await load(undefined);
    expect(await m.fetchRevenue()).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("totals recurring lines per currency", async () => {
    const m = await load("sk_test_abc");
    m.__resetStripe();
    subscriptionsList.mockReturnValue(
      pages([
        sub(),
        sub({
          items: {
            data: [
              { quantity: 2, price: { unit_amount: 500, currency: "usd", recurring: { interval: "month", interval_count: 1 } } },
            ],
          },
        }),
      ]),
    );
    const res = await m.fetchRevenue(1000);
    if (!res.ok) throw new Error("expected ok");
    expect(res.mrr).toEqual([
      { currency: "gbp", monthlyMinor: 1000 },
      { currency: "usd", monthlyMinor: 1000 },
    ]);
    expect(res.paying).toBe(2);
  });

  // A trial has not paid. Counting it as revenue is the most flattering
  // possible lie on a dashboard someone raises money against.
  it("counts trials separately and never adds them to MRR", async () => {
    const m = await load("sk_test_abc");
    m.__resetStripe();
    subscriptionsList.mockReturnValue(pages([sub({ status: "trialing" }), sub()]));
    const res = await m.fetchRevenue(1000);
    if (!res.ok) throw new Error("expected ok");
    expect(res.trialing).toBe(1);
    expect(res.paying).toBe(1);
    expect(res.mrr[0]?.monthlyMinor).toBe(1000);
  });

  it("ignores a one-off line sitting on a subscription", async () => {
    const m = await load("sk_test_abc");
    m.__resetStripe();
    subscriptionsList.mockReturnValue(
      pages([
        sub({
          items: { data: [{ quantity: 1, price: { unit_amount: 5000, currency: "gbp", recurring: null } }] },
        }),
      ]),
    );
    const res = await m.fetchRevenue(1000);
    if (!res.ok) throw new Error("expected ok");
    expect(res.mrr).toEqual([]);
  });

  it("caches briefly, so opening the dashboard does not re-page every subscription", async () => {
    const m = await load("sk_test_abc");
    m.__resetStripe();
    subscriptionsList.mockReturnValue(pages([sub()]));
    await m.fetchRevenue(1000);
    await m.fetchRevenue(2000);
    expect(subscriptionsList).toHaveBeenCalledTimes(1);
    // …and refreshes once the window passes.
    subscriptionsList.mockReturnValue(pages([sub()]));
    await m.fetchRevenue(1000 + 61_000);
    expect(subscriptionsList).toHaveBeenCalledTimes(2);
  });

  describe("failures", () => {
    it("calls a refused key rejected — retrying it can never work", async () => {
      const m = await load("sk_test_abc");
      m.__resetStripe();
      subscriptionsList.mockImplementation(() => {
        throw Object.assign(new Error("bad key"), { statusCode: 401 });
      });
      expect(await m.fetchRevenue(1000)).toEqual({ ok: false, reason: "rejected" });
    });

    it("calls a 500 unavailable — that one is worth retrying", async () => {
      const m = await load("sk_test_abc");
      m.__resetStripe();
      subscriptionsList.mockImplementation(() => {
        throw Object.assign(new Error("boom"), { statusCode: 500 });
      });
      expect(await m.fetchRevenue(1000)).toEqual({ ok: false, reason: "unavailable" });
    });

    // A bad key fails on every request; logging each one buries the signal.
    it("logs a rejected key once, and never logs the key", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const m = await load("sk_test_supersecret");
      m.__resetStripe();
      subscriptionsList.mockImplementation(() => {
        throw Object.assign(new Error("bad key"), { statusCode: 401 });
      });
      await m.fetchRevenue(1000);
      await m.fetchRevenue(2000);
      await m.fetchRevenue(3000);
      expect(err).toHaveBeenCalledTimes(1);
      expect(String(err.mock.calls[0]?.[0])).not.toContain("supersecret");
    });
  });
});

describe("fetchPaidSessions", () => {
  it("is unconfigured without a key", async () => {
    const m = await load(undefined);
    expect(await m.fetchPaidSessions(0)).toEqual({ ok: false, reason: "unconfigured" });
  });

  // Zero is the truthful answer until Connect onboarding happens — we take no
  // money today, so there are no charges to count.
  it("counts only succeeded payments", async () => {
    const m = await load("sk_test_abc");
    m.__resetStripe();
    paymentIntentsList.mockReturnValue(
      pages([
        { status: "succeeded", currency: "gbp" },
        { status: "requires_payment_method", currency: "gbp" },
        { status: "succeeded", currency: "gbp" },
      ]),
    );
    expect(await m.fetchPaidSessions(0)).toEqual({ ok: true, count: 2, currency: "gbp" });
  });
});
