/**
 * The coach directory.
 *
 * One rule above the others: **a capability is not an advertisement.** An admin
 * grants a PT capability because they checked a credential; that must never by
 * itself put someone's face in a public directory.
 */
import { describe, it, expect } from "vitest";
import {
  COACH_BIO_MAX,
  COACH_SPECIALTIES,
  bioClaimFlags,
  coachPayments,
  coachProfileInput,
  isListable,
  payoutNote,
  specialtyLabel,
} from "../coaches";

describe("isListable", () => {
  it("needs both the opt-in and a verified capability", () => {
    expect(isListable({ listed: true, staffStatus: "VERIFIED" })).toBe(true);
  });

  /**
   * "A suspended coach can't be listed", proven in pure code. The directory
   * query also enforces it, and both matter: this one makes the rule readable,
   * the query one makes it true without a backfill job.
   */
  it("refuses every status that is not VERIFIED, even when listed", () => {
    for (const status of ["PENDING", "SUSPENDED", null, "", "verified"]) {
      expect(isListable({ listed: true, staffStatus: status }), String(status)).toBe(false);
    }
  });

  // Granting a capability must never advertise someone who didn't ask.
  it("refuses a verified coach who has not opted in", () => {
    expect(isListable({ listed: false, staffStatus: "VERIFIED" })).toBe(false);
  });
});

describe("the specialty catalogue", () => {
  it("has unique slugs and resolves a label", () => {
    const slugs = COACH_SPECIALTIES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(specialtyLabel("strength")).toBe("Strength");
  });

  it("degrades to the slug for something it does not know", () => {
    expect(specialtyLabel("retired-in-2029")).toBe("retired-in-2029");
  });

  // A public directory is a health-claim surface; the vocabulary is reviewed.
  it("claims nothing in its own labels", () => {
    for (const s of COACH_SPECIALTIES) {
      const text = s.label.toLowerCase();
      for (const word of ["cure", "heal", "medical", "clinical", "therapy", "guaranteed"]) {
        expect(text, s.slug).not.toContain(word);
      }
    }
  });
});

describe("bioClaimFlags", () => {
  // A trainer is not a clinician, and a bio is the easiest place to imply it.
  it("names the reserved words it found", () => {
    expect(bioClaimFlags("I treat back pain")).toContain("treat");
    expect(bioClaimFlags("clinical rehabilitation specialist").sort()).toEqual([
      "clinical",
      "rehabilitation",
    ]);
  });

  it("is quiet about an honest bio", () => {
    expect(bioClaimFlags("Ten years coaching runners. Patient, and big on technique.")).toEqual([]);
  });

  // Word boundaries, so "breathe" is not flagged for containing "the".
  it("matches whole words only", () => {
    expect(bioClaimFlags("breathe and healthy movement")).toEqual([]);
    expect(bioClaimFlags("Therapy sessions")).toContain("therapy");
  });
});

describe("coachPayments", () => {
  /**
   * The trap this exists to avoid. A Connect account id appears the moment
   * onboarding starts — long before KYC completes — so treating a non-null id
   * as "can be paid" produces a Book button that fails at the moment of use.
   * `chargesEnabled` is the only field allowed to gate that.
   */
  it("does not treat an un-onboarded Connect account as payable", () => {
    expect(coachPayments({ bookingUrl: null, stripeChargesEnabled: false })).toBe("NONE");
  });

  it("falls back to the coach's own link", () => {
    expect(coachPayments({ bookingUrl: "https://coach.example", stripeChargesEnabled: false })).toBe(
      "EXTERNAL_LINK",
    );
  });

  it("uses Connect once charges are actually enabled", () => {
    expect(coachPayments({ bookingUrl: "https://coach.example", stripeChargesEnabled: true })).toBe(
      "CONNECT",
    );
  });
});

describe("payoutNote", () => {
  /**
   * "100% goes to your coach" is a claim, not copy. It is true while booking is
   * a hand-off to the coach's own page, and false the instant the platform
   * takes a fee — so it is derived rather than typed into a screen.
   */
  it("says the money goes direct only when it actually does", () => {
    expect(payoutNote("EXTERNAL_LINK")).toContain("BIOSYNC takes nothing");
    expect(payoutNote("NONE")).toBeNull();
    // Once the platform is in the payment path the sentence must change
    // deliberately rather than be left quietly wrong.
    expect(payoutNote("CONNECT")).toBeNull();
  });
});

describe("coachProfileInput", () => {
  const ok = { displayName: "Ann Coach", specialties: ["strength"] };

  it("accepts a reasonable profile", () => {
    expect(coachProfileInput.safeParse(ok).success).toBe(true);
  });

  it("caps the bio rather than accepting a webpage", () => {
    expect(coachProfileInput.safeParse({ ...ok, bio: "x".repeat(COACH_BIO_MAX + 1) }).success).toBe(
      false,
    );
  });

  it("refuses a specialty outside the catalogue", () => {
    expect(coachProfileInput.safeParse({ ...ok, specialties: ["miracle-worker"] }).success).toBe(
      false,
    );
  });

  it("refuses a booking link that is not a URL", () => {
    expect(coachProfileInput.safeParse({ ...ok, bookingUrl: "call me" }).success).toBe(false);
  });
});
