/**
 * Data layer for §7 treatments.
 *
 * Types come from the tRPC router, not `@pulse/shared` — mobile has no path to
 * shared and a value import fails under Metro (see CLAUDE.md). The one constant
 * that must not drift, the disclaimer, is mirrored in `src/lib/treatmentCopy.ts`
 * with a test, following the `photoFormat.ts` pattern.
 *
 * Nothing here decides whether a booking may go ahead. That answer arrives from
 * the server as `canBook`, computed by `canProceedToBooking`, and the UI must
 * key off that field alone — never off `status === "APPROVED"`, which is true of
 * an approval that has since lapsed.
 */
import { trpc } from "../../lib/trpc";

export type Suggestions = Awaited<ReturnType<typeof trpc.treatments.suggestions.query>>;
export type Suggestion = Suggestions["suggestions"][number];

export type RequestList = Awaited<ReturnType<typeof trpc.treatments.list.query>>;
export type TreatmentRequest = RequestList["requests"][number];
export type TreatmentStatus = TreatmentRequest["status"];

export type ReviewQueue = Awaited<ReturnType<typeof trpc.treatments.reviewQueue.query>>;
export type ReviewItem = ReviewQueue["requests"][number];

/** What this user's own readings surface, and whether anyone could review it. */
export async function fetchSuggestions(): Promise<Suggestions> {
  return trpc.treatments.suggestions.query();
}

/** Every request this user has made, newest first. */
export async function fetchRequests(): Promise<TreatmentRequest[]> {
  const res = await trpc.treatments.list.query();
  return res.requests;
}

/**
 * Ask a practitioner to review a protocol.
 *
 * Throws `CONFLICT` when one is already open and `PRECONDITION_FAILED` when the
 * user has no practitioner — both are states the sheet has real copy for, so
 * they must not be flattened into a generic failure.
 */
export async function requestReview(slug: string, note?: string): Promise<TreatmentRequest> {
  return trpc.treatments.request.mutate({ slug, ...(note ? { note } : {}) });
}

/** Back out of a request, before or after approval. */
export async function withdrawRequest(id: string): Promise<void> {
  await trpc.treatments.withdraw.mutate({ id });
}

/* --- practitioner --- */

/** Pending requests from this practitioner's linked clients. */
export async function fetchReviewQueue(): Promise<ReviewItem[]> {
  const res = await trpc.treatments.reviewQueue.query();
  return res.requests;
}

/** Approve a request. The optional note reaches the client. */
export async function approveRequest(id: string, note?: string): Promise<void> {
  await trpc.treatments.decide.mutate({ id, decision: "APPROVE", ...(note ? { note } : {}) });
}

/**
 * Decline, with a reason the client will read.
 *
 * The reason is required by the schema (min 10 characters) rather than optional:
 * a bare refusal tells someone nothing and leaves them no route forward.
 */
export async function declineRequest(id: string, reason: string): Promise<void> {
  await trpc.treatments.decide.mutate({ id, decision: "DECLINE", reason });
}
