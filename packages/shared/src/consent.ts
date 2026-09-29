/**
 * Consent — the trust layer's vocabulary and defaults.
 *
 * The governing rule, enforced here rather than left to the UI: **the absence of
 * a decision is never permission.** A user with no consent rows at all is fully
 * private, and `mergeConsents` fills every category with NONE before anything
 * downstream reads it. Nothing is ever pre-consented.
 */
import { z } from "zod";

export const consentCategory = z.enum(["BIOMETRICS", "JOURNAL", "DIAGNOSTICS", "PHOTOS", "ACTIVITY"]);
export type ConsentCategory = z.infer<typeof consentCategory>;

export const consentAudience = z.enum(["NONE", "TRAINER", "PRACTITIONER"]);
export type ConsentAudience = z.infer<typeof consentAudience>;

export const consentSetInput = z.object({
  category: consentCategory,
  audience: consentAudience,
});
export type ConsentSetInput = z.infer<typeof consentSetInput>;

/** Display order of the categories in the consent centre. */
export const CONSENT_ORDER: ConsentCategory[] = ["BIOMETRICS", "JOURNAL", "DIAGNOSTICS", "PHOTOS", "ACTIVITY"];

/** Plain-language label + description per category — never legalistic. */
export const CONSENT_COPY: Record<ConsentCategory, { name: string; description: string }> = {
  BIOMETRICS: { name: "Biometrics", description: "Heart rate, HRV, sleep & recovery" },
  JOURNAL: { name: "Journal & check-ins", description: "Moods, notes and daily reflections" },
  DIAGNOSTICS: { name: "Diagnostics & uploads", description: "Lab results and documents you add" },
  PHOTOS: { name: "Progress photos", description: "Photos you take to track change" },
  ACTIVITY: { name: "Activity", description: "Workouts, steps and training load" },
};

export const AUDIENCE_LABEL: Record<ConsentAudience, string> = {
  NONE: "No one",
  TRAINER: "My PT",
  PRACTITIONER: "Biomeds",
};

export type ConsentRow = { category: ConsentCategory; audience: ConsentAudience };

/**
 * Every category with its current audience, in display order. Any category the
 * user has never touched comes back as NONE — a missing row is privacy, not
 * permission.
 */
export function mergeConsents(stored: ConsentRow[]): ConsentRow[] {
  const byCategory = new Map(stored.map((r) => [r.category, r.audience] as const));
  return CONSENT_ORDER.map((category) => ({ category, audience: byCategory.get(category) ?? "NONE" }));
}

/** Categories currently visible to a given audience. NONE always sees nothing. */
export function sharedWith(rows: ConsentRow[], audience: ConsentAudience): ConsentCategory[] {
  if (audience === "NONE") return [];
  return rows.filter((r) => r.audience === audience).map((r) => r.category);
}

/** Whether anything at all is being shared — drives the first-run state. */
export function sharesAnything(rows: ConsentRow[]): boolean {
  return rows.some((r) => r.audience !== "NONE");
}
