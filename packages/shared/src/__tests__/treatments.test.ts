/**
 * §7 treatments — the rules that stop a software bug becoming a
 * regulated-medicine problem.
 *
 * These tests are deliberately blunt about what they are protecting. The
 * catalogue guard and the transition table are not testing "does the code
 * work"; they are testing that a future edit cannot quietly introduce a health
 * claim, name a prescription-only medicine, or invent a route to APPROVED that
 * doesn't go through a practitioner.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  APPROVAL_TTL_DAYS,
  SIGNAL_THRESHOLDS,
  SIGNAL_WINDOW_DAYS,
  TREATMENT_DISCLAIMER,
  TREATMENT_PENDING_NOTE,
  TREATMENT_QUEUE_DISCLAIMER,
  TREATMENT_QUEUE_LEAD,
  MIN_DECLINE_REASON,
  TREATMENT_PROTOCOLS,
  approvalExpiresAt,
  canProceedToBooking,
  canReview,
  canTransition,
  countSignals,
  daysUntilExpiry,
  effectiveStatus,
  isOpen,
  isTerminal,
  protocolBySlug,
  protocolName,
  suggestTreatments,
  treatmentDecisionInput,
  treatmentRequestInput,
  treatmentStatus,
  type SignalDay,
  type TreatmentActor,
  type TreatmentSignals,
  type TreatmentStatus,
} from "../treatments";

const NO_SIGNALS: TreatmentSignals = {
  lowEnergyDays: 0,
  lowHydrationDays: 0,
  lowSleepDays: 0,
  lowReadinessDays: 0,
};

const EMPTY_DAY: SignalDay = { energy: null, sleepHours: null, hydrationMl: null, readiness: null };

describe("the catalogue is safe to show the public", () => {
  /**
   * UK: a prescription-only medicine may not be advertised to the public
   * (Human Medicines Regulations 2012, reg. 279). The catalogue is the only
   * place this app names a treatment, so it is the only place that rule can be
   * broken. Naming a substance, a dose or a route is what crosses the line —
   * naming a *consultation* does not.
   */
  const PRODUCT_WORDS = [
    "vitamin",
    "infusion",
    "drip",
    "injection",
    "iv ",
    "glutathione",
    "nad",
    "saline",
    "mg",
    "ml",
    "dose",
    "dosage",
  ];

  /**
   * ASA/CAP: a health claim must be authorised and substantiated. We make none,
   * so no protocol may promise an effect.
   */
  const CLAIM_WORDS = [
    "boost",
    "cure",
    "heal",
    "restore",
    "detox",
    "improve",
    "increase",
    "enhance",
    "guarantee",
    "will help",
    "will make",
    "fix",
  ];

  it("names no substance, dose, or route of administration", () => {
    for (const p of TREATMENT_PROTOCOLS) {
      const text = `${p.name} ${p.summary}`.toLowerCase();
      for (const word of PRODUCT_WORDS) {
        expect(text, `"${p.slug}" contains the product word "${word}"`).not.toContain(word);
      }
    }
  });

  it("promises no outcome", () => {
    for (const p of TREATMENT_PROTOCOLS) {
      const text = `${p.name} ${p.summary}`.toLowerCase();
      for (const word of CLAIM_WORDS) {
        expect(text, `"${p.slug}" makes the claim "${word}"`).not.toContain(word);
      }
    }
  });

  it("says a practitioner reviews, in the disclaimer itself", () => {
    expect(TREATMENT_DISCLAIMER.toLowerCase()).toContain("practitioner");
    expect(TREATMENT_DISCLAIMER.toLowerCase()).toContain("review");
  });

  it("has unique, stable slugs", () => {
    const slugs = TREATMENT_PROTOCOLS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("resolves a slug, and degrades a retired one instead of breaking", () => {
    expect(protocolBySlug("energy-review")?.name).toBe("Energy review");
    expect(protocolBySlug("nope")).toBeNull();
    // A request for a withdrawn protocol still has to render — the user asked
    // for it and is owed the record.
    expect(protocolName("withdrawn-in-2027")).toBe("Treatment review");
  });
});

describe("suggestTreatments restates data and never claims", () => {
  it("suggests nothing when nothing was logged", () => {
    expect(suggestTreatments(NO_SIGNALS)).toEqual([]);
  });

  it("stays silent below the threshold and speaks at it", () => {
    const energy = TREATMENT_PROTOCOLS.find((p) => p.trigger === "LOW_ENERGY");
    if (!energy) throw new Error("energy protocol missing");

    const below = suggestTreatments({ ...NO_SIGNALS, lowEnergyDays: energy.threshold - 1 });
    expect(below).toEqual([]);

    const at = suggestTreatments({ ...NO_SIGNALS, lowEnergyDays: energy.threshold });
    expect(at.map((s) => s.slug)).toEqual([energy.slug]);
  });

  it("puts the strongest signal first", () => {
    const out = suggestTreatments({
      lowEnergyDays: 3,
      lowHydrationDays: 6,
      lowSleepDays: 4,
      lowReadinessDays: 0,
    });
    expect(out.map((s) => s.observedDays)).toEqual([6, 4, 3]);
  });

  it("states the user's own count, and the window it came from", () => {
    const [suggestion] = suggestTreatments({ ...NO_SIGNALS, lowEnergyDays: 5 });
    expect(suggestion?.reason).toBe(`You logged low energy on 5 of the last ${SIGNAL_WINDOW_DAYS} days.`);
  });

  // The whole point of computing the reason rather than generating it.
  it("never says a treatment would do anything", () => {
    const all = suggestTreatments({
      lowEnergyDays: 7,
      lowHydrationDays: 7,
      lowSleepDays: 7,
      lowReadinessDays: 7,
    });
    expect(all.length).toBe(TREATMENT_PROTOCOLS.length);
    for (const s of all) {
      expect(s.reason.toLowerCase()).not.toMatch(/boost|cure|improve|increase|restore|will /);
      // It restates. It does not recommend.
      expect(s.reason).toMatch(/^You logged /);
    }
  });

  it("is deterministic — the same signals always give the same answer", () => {
    const signals = { lowEnergyDays: 4, lowHydrationDays: 3, lowSleepDays: 0, lowReadinessDays: 5 };
    expect(suggestTreatments(signals)).toEqual(suggestTreatments(signals));
  });
});

describe("countSignals", () => {
  // The bug this prevents: surfacing treatments at someone because they stopped
  // opening the app.
  it("never counts a day with no reading", () => {
    expect(countSignals([EMPTY_DAY, EMPTY_DAY, EMPTY_DAY])).toEqual(NO_SIGNALS);
  });

  it("counts energy at or below the threshold, not above it", () => {
    const { energyAtOrBelow } = SIGNAL_THRESHOLDS;
    const days: SignalDay[] = [
      { ...EMPTY_DAY, energy: energyAtOrBelow },
      { ...EMPTY_DAY, energy: energyAtOrBelow + 1 },
    ];
    expect(countSignals(days).lowEnergyDays).toBe(1);
  });

  it("counts sleep and hydration strictly below their thresholds", () => {
    const { sleepHoursBelow, hydrationMlBelow } = SIGNAL_THRESHOLDS;
    const days: SignalDay[] = [
      { ...EMPTY_DAY, sleepHours: sleepHoursBelow, hydrationMl: hydrationMlBelow },
      { ...EMPTY_DAY, sleepHours: sleepHoursBelow - 0.5, hydrationMl: hydrationMlBelow - 1 },
    ];
    const out = countSignals(days);
    expect(out.lowSleepDays).toBe(1);
    expect(out.lowHydrationDays).toBe(1);
  });

  it("treats zero as a real reading, not as missing", () => {
    expect(countSignals([{ ...EMPTY_DAY, hydrationMl: 0 }]).lowHydrationDays).toBe(1);
  });
});

describe("the transition table", () => {
  const STATUSES = treatmentStatus.options as TreatmentStatus[];
  const ACTORS: TreatmentActor[] = ["CLIENT", "PRACTITIONER", "SYSTEM"];

  /** Exactly the transitions that may exist. Anything else is a defect. */
  const ALLOWED = new Set([
    "REQUESTED>APPROVED>PRACTITIONER",
    "REQUESTED>DECLINED>PRACTITIONER",
    "REQUESTED>WITHDRAWN>CLIENT",
    "APPROVED>WITHDRAWN>CLIENT",
    "APPROVED>EXPIRED>SYSTEM",
  ]);

  it("permits exactly five transitions, out of every combination", () => {
    let checked = 0;
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        for (const actor of ACTORS) {
          checked += 1;
          const key = `${from}>${to}>${actor}`;
          expect(canTransition(from, to, actor), key).toBe(ALLOWED.has(key));
        }
      }
    }
    expect(checked).toBe(STATUSES.length * STATUSES.length * ACTORS.length);
  });

  // The single most important assertion in the module.
  it("lets nothing but a practitioner reach APPROVED", () => {
    for (const from of STATUSES) {
      expect(canTransition(from, "APPROVED", "CLIENT")).toBe(false);
      expect(canTransition(from, "APPROVED", "SYSTEM")).toBe(false);
    }
    expect(canTransition("REQUESTED", "APPROVED", "PRACTITIONER")).toBe(true);
  });

  it("does not let a client approve their own request", () => {
    expect(canTransition("REQUESTED", "APPROVED", "CLIENT")).toBe(false);
  });

  it("does not let time approve anything — only expire an existing approval", () => {
    expect(canTransition("REQUESTED", "APPROVED", "SYSTEM")).toBe(false);
    expect(canTransition("REQUESTED", "EXPIRED", "SYSTEM")).toBe(false);
    expect(canTransition("APPROVED", "EXPIRED", "SYSTEM")).toBe(true);
  });

  it("lets a client back out after approval — permission is not obligation", () => {
    expect(canTransition("APPROVED", "WITHDRAWN", "CLIENT")).toBe(true);
  });

  it("allows nothing at all out of a terminal status", () => {
    for (const from of STATUSES.filter(isTerminal)) {
      for (const to of STATUSES) {
        for (const actor of ACTORS) {
          expect(canTransition(from, to, actor), `${from}>${to}>${actor}`).toBe(false);
        }
      }
    }
  });

  it("counts REQUESTED and APPROVED as occupying the queue", () => {
    expect(isOpen("REQUESTED")).toBe(true);
    expect(isOpen("APPROVED")).toBe(true);
    expect(isOpen("DECLINED")).toBe(false);
    expect(isOpen("WITHDRAWN")).toBe(false);
    expect(isOpen("EXPIRED")).toBe(false);
  });
});

describe("canReview", () => {
  // A trainer is not a clinician, and no consent can make them one.
  it("refuses a personal trainer and admits a practitioner", () => {
    expect(canReview("PT")).toBe(false);
    expect(canReview("PRACTITIONER")).toBe(true);
  });
});

describe("canProceedToBooking — the only gate on a booking", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-09-09T12:00:00.000Z");

  it("passes a fresh approval", () => {
    expect(canProceedToBooking({ status: "APPROVED", approvedAt: new Date(now.getTime() - day) }, now)).toBe(true);
  });

  it("refuses every status but APPROVED", () => {
    for (const status of ["REQUESTED", "DECLINED", "WITHDRAWN", "EXPIRED"] as TreatmentStatus[]) {
      expect(canProceedToBooking({ status, approvedAt: now }, now), status).toBe(false);
    }
  });

  it("refuses an approval past its TTL", () => {
    const stale = new Date(now.getTime() - (APPROVAL_TTL_DAYS + 1) * day);
    expect(canProceedToBooking({ status: "APPROVED", approvedAt: stale }, now)).toBe(false);
  });

  // An unreadable authorisation is not an authorisation.
  it("refuses an APPROVED row with no approval time", () => {
    expect(canProceedToBooking({ status: "APPROVED", approvedAt: null }, now)).toBe(false);
  });

  it("expires exactly on the boundary, not after it", () => {
    const approvedAt = new Date(now.getTime() - APPROVAL_TTL_DAYS * day);
    expect(approvalExpiresAt(approvedAt).getTime()).toBe(now.getTime());
    expect(canProceedToBooking({ status: "APPROVED", approvedAt }, now)).toBe(false);
  });
});

describe("effectiveStatus", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-09-09T12:00:00.000Z");

  it("shows a lapsed approval as expired without any job having run", () => {
    const stale = new Date(now.getTime() - (APPROVAL_TTL_DAYS + 1) * day);
    expect(effectiveStatus({ status: "APPROVED", approvedAt: stale }, now)).toBe("EXPIRED");
  });

  it("leaves a live approval alone", () => {
    expect(effectiveStatus({ status: "APPROVED", approvedAt: new Date(now.getTime() - day) }, now)).toBe("APPROVED");
  });

  it("never rewrites a decision the practitioner made", () => {
    for (const status of ["REQUESTED", "DECLINED", "WITHDRAWN"] as TreatmentStatus[]) {
      expect(effectiveStatus({ status, approvedAt: null }, now)).toBe(status);
    }
  });

  it("counts down whole days, and floors at zero", () => {
    expect(daysUntilExpiry(now, now)).toBe(APPROVAL_TTL_DAYS);
    expect(daysUntilExpiry(new Date(now.getTime() - (APPROVAL_TTL_DAYS + 5) * day), now)).toBe(0);
  });
});

describe("inputs", () => {
  it("rejects a slug that is not in the catalogue", () => {
    expect(treatmentRequestInput.safeParse({ slug: "energy-review" }).success).toBe(true);
    expect(treatmentRequestInput.safeParse({ slug: "gold-iv-drip" }).success).toBe(false);
  });

  it("caps the client's note rather than accepting unbounded text", () => {
    expect(treatmentRequestInput.safeParse({ slug: "energy-review", note: "x".repeat(501) }).success).toBe(false);
  });

  // A bare refusal leaves the client with no route forward.
  it("requires a real reason to decline, but not to approve", () => {
    const id = "0f1e5a5c-2b5e-4a3f-9c2a-7b1d9e8f0a11";
    expect(treatmentDecisionInput.safeParse({ id, decision: "APPROVE" }).success).toBe(true);
    expect(treatmentDecisionInput.safeParse({ id, decision: "DECLINE" }).success).toBe(false);
    expect(treatmentDecisionInput.safeParse({ id, decision: "DECLINE", reason: "too short" }).success).toBe(false);
    expect(
      treatmentDecisionInput.safeParse({ id, decision: "DECLINE", reason: "Not clinically appropriate right now." })
        .success,
    ).toBe(true);
  });
});

/**
 * The mobile mirror.
 *
 * `apps/mobile/src/lib/treatmentCopy.ts` duplicates the disclaimer because
 * mobile cannot import this package (CLAUDE.md) — and a disclaimer that drifts
 * is a compliance defect, not a typo. Nothing else can catch that, so this
 * reads the mirror off disk and compares the literal text.
 */
describe("the mobile mirror does not drift", () => {
  const mirrorPath = fileURLToPath(
    new URL("../../../../apps/mobile/src/lib/treatmentCopy.ts", import.meta.url),
  );

  it("exists where the comment says it does", () => {
    expect(existsSync(mirrorPath), `expected a mirror at ${mirrorPath}`).toBe(true);
  });

  it("carries the identical disclaimer and pending note", () => {
    const src = readFileSync(mirrorPath, "utf8");
    expect(src).toContain(TREATMENT_DISCLAIMER);
    expect(src).toContain(TREATMENT_PENDING_NOTE);
  });

  // The decline minimum is mirrored too: the queue gates its Confirm button on
  // it, and a client that guessed low would be rejected by the server instead.
  it("agrees on the minimum decline reason, and the schema enforces it", () => {
    const src = readFileSync(mirrorPath, "utf8");
    expect(src).toContain(`export const MIN_DECLINE_REASON = ${MIN_DECLINE_REASON};`);
    const id = "0f1e5a5c-2b5e-4a3f-9c2a-7b1d9e8f0a11";
    const at = treatmentDecisionInput.safeParse({ id, decision: "DECLINE", reason: "x".repeat(MIN_DECLINE_REASON) });
    const under = treatmentDecisionInput.safeParse({ id, decision: "DECLINE", reason: "x".repeat(MIN_DECLINE_REASON - 1) });
    expect(at.success).toBe(true);
    expect(under.success).toBe(false);
  });

  it("carries the queue disclaimer and lead verbatim", () => {
    const src = readFileSync(mirrorPath, "utf8");
    expect(src).toContain(TREATMENT_QUEUE_DISCLAIMER);
    expect(src).toContain(TREATMENT_QUEUE_LEAD);
  });
});
