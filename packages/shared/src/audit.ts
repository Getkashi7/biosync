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
  inviteCreated: "invite.created",
  inviteRevoked: "invite.revoked",
  inviteAccepted: "invite.accepted",
  linkRevoked: "link.revoked",
  // §7 treatments. A separate action per decision, so an access review can
  // answer "who approved what" without decoding `meta` — these are clinical
  // decisions, and the trail is the only durable record that a person made one.
  treatmentRequested: "treatment.requested",
  treatmentApproved: "treatment.approved",
  treatmentDeclined: "treatment.declined",
  treatmentWithdrawn: "treatment.withdrawn",
  treatmentExpired: "treatment.expired",
  // §10. Reading the trail is itself a privileged read — it reveals who is
  // connected to whom — so it is the one read in the system that watches itself.
  auditViewed: "audit.viewed",
  membersBrowsed: "members.browsed",
  // §6. A class is a shared physical event, so the trail records who scheduled
  // one and who called it off. A check-in is here for a different reason: "we
  // recorded that you were in a room" is a claim about a person, and a claim
  // about a person deserves a receipt they can read.
  coachListed: "coach.listed",
  coachUnlisted: "coach.unlisted",
  classCreated: "class.created",
  classCancelled: "class.cancelled",
  bookingCreated: "booking.created",
  bookingCancelled: "booking.cancelled",
  gymCheckedIn: "gym.checked_in",
  venueSaved: "venue.saved",
  // Rotating a venue's secret invalidates every code on every display at that
  // site at once, so it is recorded as its own act rather than as an edit.
  venueSecretRotated: "venue.secret_rotated",
  // §9. Its own action rather than folding into `staff.viewed_client`: a photo
  // is a picture of somebody's body, and "who looked at those" is a question an
  // access review has to be able to ask without decoding another action's meta.
  staffViewedPhotos: "staff.viewed_photos",
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];

/**
 * What each action says to a person reading the trail.
 *
 * The stored values are terse and stable (`staff.viewed_client`), because the
 * log is append-only and old rows keep whatever they were written with. This is
 * the presentation half, and it lives here rather than in a screen so the API
 * and any future export agree on the wording.
 */
export const AUDIT_LABELS: Record<AuditAction, string> = {
  "meal.logged": "Logged a meal",
  "meal.removed": "Removed a meal",
  "supplement.added": "Added a supplement",
  "supplement.removed": "Removed a supplement",
  "supplement.taken": "Took a supplement",
  "checkin.saved": "Saved a check-in",
  "account.deleted": "Deleted their account",
  "consent.changed": "Changed what they share",
  "plan.saved": "Saved a training plan",
  "note.written": "Wrote a session note",
  "role.changed": "Changed a capability",
  "staff.viewed_client": "Viewed a client",
  "invite.created": "Created an invitation",
  "invite.revoked": "Revoked an invitation",
  "invite.accepted": "Accepted an invitation",
  "link.revoked": "Disconnected from someone",
  "treatment.requested": "Asked for a treatment review",
  "treatment.approved": "Approved a treatment review",
  "treatment.declined": "Declined a treatment review",
  "treatment.withdrawn": "Withdrew a treatment request",
  "treatment.expired": "A treatment approval lapsed",
  "audit.viewed": "Read the audit log",
  "members.browsed": "Searched members",
  "coach.listed": "Listed themselves as a coach",
  "coach.unlisted": "Removed themselves from the directory",
  "class.created": "Scheduled a class",
  "class.cancelled": "Cancelled a class",
  "booking.created": "Booked a class",
  "booking.cancelled": "Cancelled a booking",
  "gym.checked_in": "Checked in at a venue",
  "venue.saved": "Saved a venue",
  "venue.secret_rotated": "Rotated a venue's check-in secret",
  "staff.viewed_photos": "Viewed a client's progress photos",
};

/**
 * The label for an action, degrading to the raw string.
 *
 * Never throws on an unknown value. The trail is append-only, so a row written
 * by a version that knew an action this one does not is a normal occurrence —
 * and showing the stored string is more useful than showing nothing. Same
 * reasoning as `protocolName()` for a retired treatment slug.
 */
export function auditLabel(action: string): string {
  return (AUDIT_LABELS as Record<string, string>)[action] ?? action;
}

/** What a sanitised `meta` may hold — scalars only, no nesting. */
/**
 * The access record (9F): which audit rows count as a care provider **looking**
 * at someone's data, and what each is called on that record.
 *
 * Only reads the server actually logs. The 9F handoff also drew "Photo compare"
 * and "Biometrics" — but a comparison is drawn from photos already fetched, and
 * biometrics arrive inside the client-profile read, whose row stores a category
 * *count* rather than names. Listing either would mean inventing an event the
 * trail cannot back, on the one screen whose whole claim is that it is the
 * record. So it says what was logged, and no more.
 */
export const ACCESS_LABELS: Readonly<Record<string, string>> = {
  [AUDIT.staffViewedClient]: "Profile",
  [AUDIT.staffViewedPhotos]: "Progress photos",
};

export const ACCESS_ACTIONS: readonly string[] = Object.keys(ACCESS_LABELS);

/** How many rows an access record returns. */
// ponytail: newest 100, no paging — add a cursor when a real client passes it.
export const ACCESS_RECORD_LIMIT = 100;

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
