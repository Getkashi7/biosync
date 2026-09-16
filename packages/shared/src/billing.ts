/**
 * Recurring-revenue arithmetic.
 *
 * This lives here, as pure functions over plain shapes, rather than inside the
 * Stripe call that fetches the data — because MRR maths that only exists inside
 * a network request is a number nobody can check. An admin makes decisions off
 * this figure; it deserves a test suite, not a debugger session.
 *
 * Two rules that are easy to get wrong and expensive to get wrong:
 *
 * 1. **Currencies are never summed.** One "MRR" made of GBP plus USD is a
 *    fabricated figure — it is not a total in any currency that exists. Totals
 *    come back per currency and the screen shows them separately.
 * 2. **Trials are not revenue.** A subscription in `trialing` has not paid and
 *    may never pay. It is counted, and counted separately.
 *
 * Everything is in **minor units** (pence, cents) as integers, because that is
 * what Stripe returns and because rounding money repeatedly is how totals drift.
 * Divide once, at the end, for display.
 */

/** How often a price recurs. Mirrors Stripe's `price.recurring.interval`. */
export type BillingInterval = "day" | "week" | "month" | "year";

export type RecurringLine = {
  /** price in minor units, per interval */
  unitAmount: number;
  quantity: number;
  interval: BillingInterval;
  /** e.g. every 3 months → interval "month", intervalCount 3 */
  intervalCount: number;
  /** ISO 4217, lower-cased as Stripe returns it */
  currency: string;
};

/** Days per interval, for normalising to a month. */
const DAYS: Record<BillingInterval, number> = { day: 1, week: 7, month: 30, year: 365 };

/**
 * One line's contribution to monthly recurring revenue, in minor units.
 *
 * Month and year are exact fractions (12 months to a year). Day and week are
 * normalised through an average month of 365/12 days, which is the convention
 * Stripe's own reporting uses — a "30-day month" would overstate a daily plan
 * by about 1.4%.
 *
 * Returns a float on purpose: rounding here, then summing, compounds the error.
 * `sumMrr` rounds once at the end.
 */
export function monthlyMinorFor(line: RecurringLine): number {
  const count = line.intervalCount > 0 ? line.intervalCount : 1;
  const perPeriod = line.unitAmount * line.quantity;
  if (line.interval === "month") return perPeriod / count;
  if (line.interval === "year") return perPeriod / (12 * count);
  // day and week, via the average month
  const daysPerPeriod = DAYS[line.interval] * count;
  return (perPeriod * (365 / 12)) / daysPerPeriod;
}

export type CurrencyTotal = { currency: string; monthlyMinor: number };

/**
 * Total MRR per currency, rounded once.
 *
 * Sorted by currency so the same inputs always render in the same order — a
 * dashboard whose rows reshuffle between loads reads as though the numbers
 * changed.
 */
export function sumMrr(lines: readonly RecurringLine[]): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const key = line.currency.toLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + monthlyMinorFor(line));
  }
  return [...totals.entries()]
    .map(([currency, minor]) => ({ currency, monthlyMinor: Math.round(minor) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Whether a Stripe subscription status counts toward MRR.
 *
 * `active` and `past_due` do: past_due is a payment that has failed but a
 * subscription Stripe is still retrying, and writing it off the moment a card
 * bounces would make MRR jump around for a reason that usually resolves itself.
 * Everything else — trialing, incomplete, canceled, unpaid, paused — does not.
 */
export function countsTowardMrr(status: string): boolean {
  return status === "active" || status === "past_due";
}

/**
 * Minor units → a display string, e.g. 12345 → "123.45".
 *
 * Deliberately returns the number only, with no symbol: currency symbols are a
 * presentation decision and this module is shared by a server that renders
 * nothing. Zero-decimal currencies (JPY, KRW) are not handled — flagged rather
 * than silently wrong, and the caller should not use this for them yet.
 */
export function formatMinor(minor: number, decimals = 2): string {
  return (minor / 10 ** decimals).toFixed(decimals);
}
