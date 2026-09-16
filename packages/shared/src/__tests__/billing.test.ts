/**
 * MRR arithmetic.
 *
 * These exist because this is the one number on the admin dashboard someone
 * makes a business decision from, and because the two ways to get it wrong —
 * summing across currencies, and counting trials as revenue — both produce a
 * figure that looks entirely plausible.
 */
import { describe, it, expect } from "vitest";
import {
  countsTowardMrr,
  formatMinor,
  monthlyMinorFor,
  sumMrr,
  type RecurringLine,
} from "../billing";

const line = (over: Partial<RecurringLine> = {}): RecurringLine => ({
  unitAmount: 1000,
  quantity: 1,
  interval: "month",
  intervalCount: 1,
  currency: "gbp",
  ...over,
});

describe("monthlyMinorFor", () => {
  it("passes a monthly price straight through", () => {
    expect(monthlyMinorFor(line())).toBe(1000);
  });

  it("divides a yearly price by twelve", () => {
    expect(monthlyMinorFor(line({ interval: "year", unitAmount: 12000 }))).toBe(1000);
  });

  it("accounts for the interval count", () => {
    // £30 every 3 months is £10 a month, not £30.
    expect(monthlyMinorFor(line({ unitAmount: 3000, intervalCount: 3 }))).toBe(1000);
    // £24 every 2 years is £1 a month.
    expect(monthlyMinorFor(line({ interval: "year", unitAmount: 2400, intervalCount: 2 }))).toBe(100);
  });

  it("multiplies by quantity", () => {
    expect(monthlyMinorFor(line({ quantity: 3 }))).toBe(3000);
  });

  // An average month, not a 30-day one: a "30-day month" overstates a daily
  // plan by about 1.4%, every month, forever.
  it("normalises daily and weekly through an average month", () => {
    expect(monthlyMinorFor(line({ interval: "day", unitAmount: 100 }))).toBeCloseTo(3041.67, 1);
    expect(monthlyMinorFor(line({ interval: "week", unitAmount: 700 }))).toBeCloseTo(3041.67, 1);
  });

  it("treats a zero or negative interval count as one rather than dividing by it", () => {
    expect(monthlyMinorFor(line({ intervalCount: 0 }))).toBe(1000);
    expect(monthlyMinorFor(line({ intervalCount: -1 }))).toBe(1000);
  });

  it("handles a free plan without producing NaN", () => {
    expect(monthlyMinorFor(line({ unitAmount: 0 }))).toBe(0);
    expect(monthlyMinorFor(line({ quantity: 0 }))).toBe(0);
  });
});

describe("sumMrr", () => {
  /**
   * The rule this whole module exists for. A single "MRR" made of pounds plus
   * dollars is not a total in any currency that exists.
   */
  it("never sums across currencies", () => {
    const totals = sumMrr([
      line({ currency: "gbp", unitAmount: 1000 }),
      line({ currency: "usd", unitAmount: 2000 }),
      line({ currency: "gbp", unitAmount: 500 }),
    ]);
    expect(totals).toEqual([
      { currency: "gbp", monthlyMinor: 1500 },
      { currency: "usd", monthlyMinor: 2000 },
    ]);
  });

  it("treats currency case as insignificant", () => {
    const totals = sumMrr([line({ currency: "GBP" }), line({ currency: "gbp" })]);
    expect(totals).toHaveLength(1);
    expect(totals[0]?.monthlyMinor).toBe(2000);
  });

  // Rounding each line and then adding compounds the error; round once.
  it("rounds once at the end, not per line", () => {
    const thirds = Array.from({ length: 3 }, () => line({ unitAmount: 1000, intervalCount: 3 }));
    expect(sumMrr(thirds)[0]?.monthlyMinor).toBe(1000);
  });

  it("always returns whole minor units", () => {
    for (const t of sumMrr([line({ interval: "day", unitAmount: 33 })])) {
      expect(Number.isInteger(t.monthlyMinor)).toBe(true);
    }
  });

  it("is stable in order, so a dashboard does not reshuffle between loads", () => {
    const a = sumMrr([line({ currency: "usd" }), line({ currency: "eur" }), line({ currency: "gbp" })]);
    const b = sumMrr([line({ currency: "gbp" }), line({ currency: "usd" }), line({ currency: "eur" })]);
    expect(a).toEqual(b);
    expect(a.map((t) => t.currency)).toEqual(["eur", "gbp", "usd"]);
  });

  it("is empty for no subscriptions, rather than a zero of unknown currency", () => {
    expect(sumMrr([])).toEqual([]);
  });
});

describe("countsTowardMrr", () => {
  // A trial has not paid and may never pay.
  it("excludes trials", () => {
    expect(countsTowardMrr("trialing")).toBe(false);
  });

  /**
   * past_due is a failed charge Stripe is still retrying. Writing it off the
   * moment a card bounces makes MRR lurch for a reason that usually resolves
   * itself within days.
   */
  it("includes active and past_due, excludes everything else", () => {
    expect(countsTowardMrr("active")).toBe(true);
    expect(countsTowardMrr("past_due")).toBe(true);
    for (const s of ["incomplete", "incomplete_expired", "canceled", "unpaid", "paused", ""]) {
      expect(countsTowardMrr(s), s).toBe(false);
    }
  });
});

describe("formatMinor", () => {
  it("renders minor units as a decimal, with no currency symbol", () => {
    expect(formatMinor(12345)).toBe("123.45");
    expect(formatMinor(0)).toBe("0.00");
    expect(formatMinor(5)).toBe("0.05");
  });
});
