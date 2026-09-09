/**
 * The §7 offer's rate limit.
 *
 * These are the conditions that stop a health nudge becoming an upsell that
 * follows someone around. Each `it` names the behaviour it prevents, because
 * the failure mode here is not a crash — it is an app that quietly starts
 * pestering people about treatments after one bad week.
 */
import { describe, it, expect } from "vitest";
import { OFFER_COOLDOWN_DAYS, shouldOffer, type OfferInputs } from "../treatmentOffer";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-09T12:00:00.000Z");

/** Everything satisfied — each test breaks exactly one condition. */
const ELIGIBLE: OfferInputs = {
  suggestionCount: 1,
  hasPractitioner: true,
  openRequestCount: 0,
  lastShownAt: null,
  now: NOW,
};

describe("shouldOffer", () => {
  it("offers when every condition is met and it has never been shown", () => {
    expect(shouldOffer(ELIGIBLE)).toBe(true);
  });

  // Without a suggestion there is no reading to restate, so the sheet would
  // have nothing true to say.
  it("stays silent when the user's readings surfaced nothing", () => {
    expect(shouldOffer({ ...ELIGIBLE, suggestionCount: 0 })).toBe(false);
  });

  // The screen it leads to can only tell them they cannot ask.
  it("stays silent when there is no practitioner to ask", () => {
    expect(shouldOffer({ ...ELIGIBLE, hasPractitioner: false })).toBe(false);
  });

  it("stays silent when they have already asked", () => {
    expect(shouldOffer({ ...ELIGIBLE, openRequestCount: 1 })).toBe(false);
  });

  describe("the cooldown", () => {
    it("holds for the full period, dismissed or not", () => {
      const justBefore = { ...ELIGIBLE, lastShownAt: NOW - (OFFER_COOLDOWN_DAYS * DAY - 1) };
      expect(shouldOffer(justBefore)).toBe(false);
    });

    it("releases exactly on the boundary", () => {
      const exactly = { ...ELIGIBLE, lastShownAt: NOW - OFFER_COOLDOWN_DAYS * DAY };
      expect(shouldOffer(exactly)).toBe(true);
    });

    it("does not re-offer the next day", () => {
      expect(shouldOffer({ ...ELIGIBLE, lastShownAt: NOW - DAY })).toBe(false);
    });

    // A timezone change or a manually set clock must not unlock it early.
    it("treats a clock that went backwards as just-shown", () => {
      expect(shouldOffer({ ...ELIGIBLE, lastShownAt: NOW + 5 * DAY })).toBe(false);
    });
  });

  it("is a fortnight, not a day", () => {
    expect(OFFER_COOLDOWN_DAYS).toBeGreaterThanOrEqual(14);
  });
});
