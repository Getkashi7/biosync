/**
 * Stripe reads for the admin dashboard.
 *
 * **Constructed lazily, and that is not a style choice.** `new Stripe("")`
 * throws, so building the client at module scope would make importing this file
 * fail the moment anything did so without a key — which is every run of the test
 * suite, and every deploy that has not been given one. `env.ts` already reads
 * "lazily so importing modules never requires secrets"; this follows it.
 *
 * Nothing here writes. MRR and volume are computed from Stripe's own record on
 * demand, so there is no local state to keep in step and no webhook to receive.
 *
 * The arithmetic is NOT here — it is in `@pulse/shared` `billing.ts`, tested
 * against plain shapes. MRR that only exists inside a network call is a number
 * nobody can check, and this is the figure someone runs a business on.
 */
import Stripe from "stripe";
import { countsTowardMrr, sumMrr, type BillingInterval, type RecurringLine } from "@pulse/shared";
import { env } from "../env";

/** Whether this deploy has been given a key at all. */
export function stripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

/** The client, or null when unconfigured. Never throws. */
export function getStripe(): Stripe | null {
  if (!stripeConfigured()) return null;
  // No explicit apiVersion: the SDK pins one, and naming a different
  // string here only creates a second place to drift. Upgrading the
  // package is the deliberate way to move API versions.
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Which set of books we are reading.
 *
 * Returned on the authed admin surface, never on `/health/config`: an admin
 * looking at "£0 MRR" needs to know whether they are reading test data, and
 * that is exactly the class of silently-wrong number the config endpoint
 * exists to prevent. But `/health/config` is unauthenticated and the rule
 * there is booleans only.
 */
export function stripeMode(): "live" | "test" | null {
  if (!stripeConfigured()) return null;
  return env.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live" : "test";
}

/** Why a Stripe read didn't produce numbers. */
export type StripeFailure = "unconfigured" | "rejected" | "unavailable";

export type RevenueResult =
  | {
      ok: true;
      mode: "live" | "test";
      mrr: { currency: string; monthlyMinor: number }[];
      /** subscriptions in a trial — counted, never added to MRR */
      trialing: number;
      /** subscriptions contributing to MRR */
      paying: number;
      fetchedAt: string;
    }
  | { ok: false; reason: StripeFailure };

/**
 * A rejected key fails identically on every request, so saying so once is a
 * signal and saying so every time is noise. Reset on success, so a fix goes
 * quiet and a fresh break is reported again — the same shape `groq.ts` settled
 * on after an invalid key hid behind "couldn't reach the coach" for weeks.
 */
let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.error(message);
}

/**
 * Dashboard reads are cheap to repeat and expensive to compute — auto-paginating
 * every subscription on each screen open would burn rate limit for a number that
 * changes hourly at most. `fetchedAt` travels with the result so the screen can
 * say how old it is rather than implying it is live.
 */
const TTL_MS = 60_000;
let cached: { at: number; value: RevenueResult } | null = null;

/** Test seam — clears the cache and the once-only warning between cases. */
export function __resetStripe(): void {
  cached = null;
  warned = false;
  client = null;
}

function classify(err: unknown): StripeFailure {
  const status = (err as { statusCode?: number })?.statusCode;
  // 401 is a key Stripe refuses; retrying cannot fix it.
  if (status === 401 || status === 403) return "rejected";
  return "unavailable";
}

/**
 * Current recurring revenue, per currency.
 *
 * Reads active subscriptions and their price lines. A line whose price has no
 * `recurring` block contributes nothing: a one-off charge sitting on a
 * subscription is not recurring revenue.
 */
export async function fetchRevenue(now: number = Date.now()): Promise<RevenueResult> {
  if (cached && now - cached.at < TTL_MS) return cached.value;

  const stripe = getStripe();
  const mode = stripeMode();
  if (!stripe || !mode) return { ok: false, reason: "unconfigured" };

  try {
    const lines: RecurringLine[] = [];
    let trialing = 0;
    let paying = 0;

    // `all: "..."` needs every status so trials can be counted separately;
    // autoPagingEach handles starting_after correctly, which is the reason this
    // uses the SDK rather than the raw fetch the Groq client uses.
    for await (const sub of stripe.subscriptions.list({
      status: "all",
      expand: ["data.items.data.price"],
      limit: 100,
    })) {
      if (sub.status === "trialing") {
        trialing += 1;
        continue;
      }
      if (!countsTowardMrr(sub.status)) continue;
      paying += 1;

      for (const item of sub.items.data) {
        const price = item.price;
        // A one-off line on a subscription is not recurring revenue.
        if (!price?.recurring || price.unit_amount === null) continue;
        lines.push({
          unitAmount: price.unit_amount,
          quantity: item.quantity ?? 1,
          interval: price.recurring.interval as BillingInterval,
          intervalCount: price.recurring.interval_count ?? 1,
          currency: price.currency,
        });
      }
    }

    warned = false;
    const value: RevenueResult = {
      ok: true,
      mode,
      mrr: sumMrr(lines),
      trialing,
      paying,
      fetchedAt: new Date(now).toISOString(),
    };
    cached = { at: now, value };
    return value;
  } catch (err) {
    const reason = classify(err);
    if (reason === "rejected") {
      // Never the key itself — only that Stripe is refusing it.
      warnOnce("[stripe] key rejected — revenue figures are unavailable until it is replaced");
    }
    return { ok: false, reason };
  }
}

export type PaidSessions = { ok: true; count: number; currency: string | null } | { ok: false; reason: StripeFailure };

/**
 * Succeeded payments in a window.
 *
 * **This will be 0 until Connect onboarding happens, and that is the truthful
 * answer** — BIOSYNC takes no money today, so there are no charges to count.
 * Reported beside our own booking count under a different name, because
 * "sessions booked" and "sessions paid for" are different facts and conflating
 * them would be the lie.
 */
export async function fetchPaidSessions(sinceMs: number): Promise<PaidSessions> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, reason: "unconfigured" };
  try {
    let count = 0;
    let currency: string | null = null;
    for await (const pi of stripe.paymentIntents.list({
      created: { gte: Math.floor(sinceMs / 1000) },
      limit: 100,
    })) {
      if (pi.status !== "succeeded") continue;
      count += 1;
      currency ??= pi.currency;
    }
    return { ok: true, count, currency };
  } catch (err) {
    const reason = classify(err);
    if (reason === "rejected") {
      warnOnce("[stripe] key rejected — payment counts are unavailable until it is replaced");
    }
    return { ok: false, reason };
  }
}
