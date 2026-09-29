/**
 * §7 treatment copy and status presentation.
 *
 * Mirrors `TREATMENT_DISCLAIMER`, `TREATMENT_PENDING_NOTE` and the status
 * vocabulary in `@pulse/shared` `treatments.ts` — mobile cannot import shared
 * (CLAUDE.md), so these are duplicated deliberately and covered by a test, the
 * same arrangement as `photoFormat.ts` and `reminderSchedule.ts`. **Keep them
 * in step: the disclaimer is a regulatory requirement, not a caption.**
 */

/** Shown above every suggestion, before anything has been requested. */
export const TREATMENT_DISCLAIMER =
  "Wellness suggestion only. The Biomeds doctor will review your booking.";

/** Replaces the disclaimer once a request exists. */
export const TREATMENT_PENDING_NOTE =
  "Nothing is booked. The Biomeds doctor reviews every request before anything goes ahead.";

/**
 * Where an approved review is actually booked.
 *
 * BIOSYNC does not take bookings. This opens the clinic's own site, and only
 * ever from an APPROVED request — the order is the whole point: a treatment
 * booking must never be reachable before a clinician has looked at the request,
 * so this is gated on `canBook`, which is the server's `canProceedToBooking`
 * and is false for a lapsed approval too.
 *
 * Unset in most builds. When it is unset the button is simply absent and the
 * card says the practitioner will arrange it — which is what happens, and is
 * still true. Never render a booking button that goes nowhere.
 */
export const CLINIC_BOOKING_URL = process.env.EXPO_PUBLIC_CLINIC_BOOKING_URL ?? "";

/** Whether an approved request can offer the hand-off. */
export function canOpenClinic(canBook: boolean): boolean {
  return canBook && CLINIC_BOOKING_URL.length > 0;
}

/** What the card says once a review is approved. */
export function bookingNote(canBook: boolean): string {
  if (!canBook) return "";
  return canOpenClinic(canBook)
    ? "Booking happens on the clinic's own site — BIOSYNC doesn't take bookings."
    : "The Biomeds doctor will arrange the appointment with you directly.";
}

/** The footer on every card in the practitioner's approvals queue (design 5B). */
export const TREATMENT_QUEUE_DISCLAIMER =
  "General wellness service — not medical treatment, diagnosis or advice. Your decision is logged.";

/** The lead paragraph under the queue header. */
export const TREATMENT_QUEUE_LEAD =
  "Bookings stay on hold until you decide. Declining requires a reason, which is shared with the client.";

/**
 * Minimum characters in a decline reason — the server's rule, mirrored so the
 * button can wait rather than fail. The design enables Confirm on any non-empty
 * text; the API requires ten, and a Confirm that gets rejected is worse than a
 * Confirm that tells you what it still needs.
 */
export const MIN_DECLINE_REASON = 10;

export type TreatmentStatus = "REQUESTED" | "APPROVED" | "DECLINED" | "WITHDRAWN" | "EXPIRED";

/** The accent a status is drawn in. Keys of `bio.color`, resolved by the caller. */
export type StatusTone = "pending" | "approved" | "closed";

export function statusTone(status: TreatmentStatus): StatusTone {
  if (status === "REQUESTED") return "pending";
  if (status === "APPROVED") return "approved";
  return "closed";
}

/**
 * The short label on a request row.
 *
 * "Awaiting review" rather than "Pending": pending is what a booking says, and
 * this is explicitly not a booking. The wording has to keep saying so.
 */
export function statusLabel(status: TreatmentStatus): string {
  switch (status) {
    case "REQUESTED":
      return "Awaiting review";
    case "APPROVED":
      return "Approved";
    case "DECLINED":
      return "Declined";
    case "WITHDRAWN":
      return "Withdrawn";
    case "EXPIRED":
      return "Approval expired";
  }
}

/**
 * The sentence under the label. Each says what is true of the request *now*,
 * and none of them implies an appointment exists — the app never books.
 */
export function statusBody(status: TreatmentStatus, expiresInDays: number | null): string {
  switch (status) {
    case "REQUESTED":
      return "The Biomeds doctor hasn't looked at this yet. Nothing is booked.";
    case "APPROVED":
      return expiresInDays === null
        ? "The Biomeds doctor approved this review."
        : expiresInDays <= 1
          ? "The Biomeds doctor approved this review. It lapses today."
          : `The Biomeds doctor approved this review. It lapses in ${expiresInDays} days.`;
    case "DECLINED":
      return "The Biomeds doctor decided this isn't right for you.";
    case "WITHDRAWN":
      return "You withdrew this request.";
    case "EXPIRED":
      return "The approval lapsed before it was used. You can ask again.";
  }
}

/** Whether the row should offer a withdraw action. Mirrors the transition table. */
export function canWithdraw(status: TreatmentStatus): boolean {
  return status === "REQUESTED" || status === "APPROVED";
}

/**
 * "just now" / "2h ago" / "yesterday" / "6 Sep" — the `Requested …` line on a
 * queue card (design 5B).
 *
 * Relative only while it stays unambiguous. Past two days it becomes a date,
 * because "3d ago" makes a practitioner do arithmetic to work out whether a
 * request has been sitting over a weekend, and the queue is exactly where that
 * matters.
 */
export function relativeDay(d: Date, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  // A clock skew shouldn't produce "-3m ago"; treat the future as now.
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()] ?? ""}`.trim();
}
