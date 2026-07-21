/**
 * Staff access — what a trainer or practitioner may actually see.
 *
 * The role explainer screen promises the user, in plain words, that a trainer
 * "never sees your health records". This module is where that promise is
 * *enforced*, so it can't drift into being marketing copy:
 *
 *   visible = (categories the user consented to that audience)
 *             ∩ (categories the role is EVER allowed to see)
 *
 * Both sides are required. Consent alone doesn't grant access — a trainer can't
 * be handed diagnostics even if the user tries to share them, because the role
 * cap is a hard ceiling. And a role cap alone grants nothing without consent.
 *
 * Access also requires an ACTIVE link (that's enforced at the query layer); this
 * file answers only "given a link, which categories?".
 */
import type { ConsentCategory, ConsentRow, ConsentAudience } from "./consent";

/** The staff capacities that can hold a client link. */
export type StaffRole = "PT" | "PRACTITIONER";

/**
 * The hard ceiling per role — what that role may EVER see, regardless of what
 * the user consents to. Narrower than consent on purpose.
 */
export const ROLE_CEILING: Record<StaffRole, ConsentCategory[]> = {
  // fitness & activity only — never health records
  PT: ["ACTIVITY", "PHOTOS"],
  // may see health data, but only what's explicitly shared
  PRACTITIONER: ["BIOMETRICS", "JOURNAL", "DIAGNOSTICS", "PHOTOS", "ACTIVITY"],
};

/** The consent audience that corresponds to a staff role. */
export const ROLE_AUDIENCE: Record<StaffRole, ConsentAudience> = {
  PT: "TRAINER",
  PRACTITIONER: "PRACTITIONER",
};

/**
 * Categories this staff member may read for this client: consented AND within
 * the role's ceiling. Returns them in a stable order.
 */
export function staffVisibleCategories(consents: ConsentRow[], role: StaffRole): ConsentCategory[] {
  const audience = ROLE_AUDIENCE[role];
  const ceiling = new Set(ROLE_CEILING[role]);
  return consents
    .filter((c) => c.audience === audience && ceiling.has(c.category))
    .map((c) => c.category);
}

/** Whether a staff member may read one specific category for this client. */
export function staffCanSee(consents: ConsentRow[], role: StaffRole, category: ConsentCategory): boolean {
  return staffVisibleCategories(consents, role).includes(category);
}
