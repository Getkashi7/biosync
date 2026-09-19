/**
 * The public coach directory (§6).
 *
 * The rule this module exists to hold: **a capability is not an advertisement.**
 * An admin grants someone a PT capability because they checked a credential.
 * That is a permission, and it must never by itself put a person's face and bio
 * in a directory — being listed is the coach's own decision, taken separately,
 * and revocable separately.
 *
 * `isListable` is where the two meet. Both must be true, so a suspension
 * delists on the next read with no backfill job to forget about.
 *
 * Specialties are a code catalogue rather than free text for the same reason
 * §7's protocols are: a public directory where anyone can type their own
 * speciality is an uncontrolled health-claim surface, and ASA/CAP applies to
 * any health claim, not only to medicines.
 */
import { z } from "zod";

/** The vocabulary a coach may describe themselves with. Reviewed in PRs. */
export const COACH_SPECIALTIES = [
  { slug: "strength", label: "Strength" },
  { slug: "conditioning", label: "Conditioning" },
  { slug: "mobility", label: "Mobility" },
  { slug: "running", label: "Running" },
  { slug: "post-natal", label: "Post-natal" },
  { slug: "older-adults", label: "Older adults" },
  { slug: "beginners", label: "Beginners" },
  { slug: "technique", label: "Technique" },
] as const;

export type CoachSpecialty = (typeof COACH_SPECIALTIES)[number]["slug"];

export const coachSpecialty = z.enum([
  "strength",
  "conditioning",
  "mobility",
  "running",
  "post-natal",
  "older-adults",
  "beginners",
  "technique",
]);

export function specialtyLabel(slug: string): string {
  return COACH_SPECIALTIES.find((s) => s.slug === slug)?.label ?? slug;
}

/** Long enough to say something useful, short enough not to become a webpage. */
export const COACH_BIO_MAX = 400;

/**
 * Words a coach may not use about themselves.
 *
 * A trainer is not a clinician, and a bio is the easiest place in the app to
 * imply otherwise. This is a boundary check on user input, not moderation — it
 * catches the obvious and names what it caught, so the coach can rewrite rather
 * than guess.
 */
const CLAIM_WORDS = [
  "cure",
  "heal",
  "treat",
  "diagnose",
  "diagnosis",
  "medical",
  "clinical",
  "prescribe",
  "prescription",
  "therapy",
  "therapist",
  "doctor",
  "nurse",
  "physio",
  "rehabilitation",
  "guaranteed",
  "guarantee",
];

/**
 * Which reserved words a bio contains, or an empty list.
 *
 * Word-boundary matched, so "therapist" is caught and "breathe" is not flagged
 * for containing "the".
 */
export function bioClaimFlags(text: string): string[] {
  const lower = text.toLowerCase();
  return CLAIM_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
}

/**
 * Whether a coach may appear in the directory.
 *
 * Both halves are required, every time, and this is the only function that
 * decides it. `listed` is the coach's consent; a VERIFIED PT capability is the
 * platform's. Neither alone is enough.
 */
export function isListable(input: { listed: boolean; staffStatus: string | null }): boolean {
  return input.listed && input.staffStatus === "VERIFIED";
}

/**
 * How — or whether — a coach can be paid.
 *
 * `NONE` is the honest default: no booking link and no Connect account means
 * there is no way to engage them through the app yet, and a Book button would
 * be a lie.
 *
 * `chargesEnabled` is the ONLY field that may gate a payment action. A Connect
 * account id exists from the moment onboarding starts, long before KYC
 * completes — treating a non-null id as "can take money" would produce a button
 * that fails at the moment of use, which is the photo-upload bug with a new
 * vendor.
 */
export type CoachPayments = "NONE" | "EXTERNAL_LINK" | "CONNECT";

export function coachPayments(input: {
  bookingUrl: string | null;
  stripeChargesEnabled: boolean;
}): CoachPayments {
  if (input.stripeChargesEnabled) return "CONNECT";
  if (input.bookingUrl) return "EXTERNAL_LINK";
  return "NONE";
}

/**
 * The line under a coach card about where the money goes.
 *
 * Derived, never hard-coded. "100% goes to your coach" is true while booking is
 * a hand-off to their own page and becomes false the instant the platform takes
 * an application fee — so it has to be computed from the payment state rather
 * than typed into a screen, in the same way §7's disclaimer is a shared constant
 * rather than a string in a component.
 */
export function payoutNote(state: CoachPayments): string | null {
  if (state === "EXTERNAL_LINK") {
    return "You pay your coach directly — BIOSYNC takes nothing and handles no payment.";
  }
  // Once the platform is in the payment path this sentence has to change, and
  // it should be changed deliberately rather than left quietly wrong.
  if (state === "CONNECT") return null;
  return null;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                             */
/* ------------------------------------------------------------------ */

export const coachProfileInput = z.object({
  displayName: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(COACH_BIO_MAX).optional(),
  specialties: z.array(coachSpecialty).max(4).default([]),
  bookingUrl: z.string().trim().url().max(500).nullish(),
});

export const coachListedInput = z.object({ listed: z.boolean() });
export const coachIdInput = z.object({ userId: z.string().uuid() });

export const coachListInput = z.object({
  specialty: coachSpecialty.optional(),
  cursor: z.string().max(256).optional(),
});

export type CoachProfileInput = z.infer<typeof coachProfileInput>;
export type CoachListInput = z.infer<typeof coachListInput>;
