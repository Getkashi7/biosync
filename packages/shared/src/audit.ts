/**
 * Audit trail — the vocabulary of recordable actions, plus the guard that keeps
 * health data out of the trail.
 *
 * An audit log answers "who did what, when" for the compliance layer. It must
 * NOT become a second copy of the user's health record: knowing that a meal was
 * logged is auditable, knowing it was 820 kcal is not. `sanitiseAuditMeta` is
 * the chokepoint that enforces that — every write goes through it.
 */

/**
 * Recordable actions. Plain strings (not a DB enum) so adding one never needs a
 * migration; keep the values stable, since the trail is append-only and old rows
 * keep whatever they were written with.
 */
export const AUDIT = {
  mealLogged: "meal.logged",
  mealRemoved: "meal.removed",
  supplementAdded: "supplement.added",
  supplementRemoved: "supplement.removed",
  supplementTaken: "supplement.taken",
  checkinSaved: "checkin.saved",
  accountDeleted: "account.deleted",
  consentChanged: "consent.changed",
  planSaved: "plan.saved",
  noteWritten: "note.written",
  roleChanged: "role.changed",
  staffViewedClient: "staff.viewed_client",
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];

/** What a sanitised `meta` may hold — scalars only, no nesting. */
export type AuditMeta = Record<string, string | number | boolean>;

export type AuditEntry = {
  actorId: string;
  subjectId?: string | null;
  action: AuditAction;
  entity?: string | null;
  entityId?: string | null;
  meta?: AuditMeta | null;
};

/**
 * Keys that carry (or strongly imply) a health value. Matched as substrings so
 * `proteinG`, `sleep_hours` and `restingHr` are all caught. Deliberately broad:
 * a dropped key costs nothing, a leaked measurement is a data-protection issue.
 */
const HEALTH_KEYS = [
  "calorie",
  "kcal",
  "protein",
  "carb",
  "fat",
  "fiber",
  "fibre",
  "dose",
  "weight",
  "glucose",
  "hrv",
  "heart",
  "hr",
  "bpm",
  "sleep",
  "energy",
  "mood",
  "readiness",
  "score",
  "hydration",
  "value",
  "note",
  "description",
  "symptom",
];

/** Longest a single meta string may be before it's dropped. */
const MAX_STRING = 64;

/**
 * Reduce arbitrary metadata to something safe to persist: scalars only, no
 * health-bearing keys, no long free text (which could carry anything). Returns
 * null when nothing survives, so we store SQL NULL rather than `{}`.
 */
export function sanitiseAuditMeta(meta: Record<string, unknown> | null | undefined): AuditMeta | null {
  if (!meta) return null;
  const out: AuditMeta = {};

  for (const [key, raw] of Object.entries(meta)) {
    const lower = key.toLowerCase();
    if (HEALTH_KEYS.some((h) => lower.includes(h))) continue;

    if (typeof raw === "number") {
      if (Number.isFinite(raw)) out[key] = raw;
      continue;
    }
    if (typeof raw === "boolean") {
      out[key] = raw;
      continue;
    }
    if (typeof raw === "string") {
      // free text can hold anything, including health detail — keep it short
      if (raw.length > 0 && raw.length <= MAX_STRING) out[key] = raw;
      continue;
    }
    // objects, arrays, null, undefined, functions — dropped
  }

  return Object.keys(out).length > 0 ? out : null;
}
