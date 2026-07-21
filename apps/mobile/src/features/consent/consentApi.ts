/**
 * Data layer for the consent centre. Kept apart from the screens so they stay
 * presentation-only.
 */
import { trpc } from "../../lib/trpc";

export type ConsentList = Awaited<ReturnType<typeof trpc.consent.list.query>>;
export type ConsentRow = ConsentList["consents"][number];
export type ConsentCategory = ConsentRow["category"];
export type ConsentAudience = ConsentRow["audience"];

/** Every category with its current audience; untouched ones come back as NONE. */
export async function fetchConsents(): Promise<ConsentRow[]> {
  const res = await trpc.consent.list.query();
  return res.consents;
}

/** Change who can see one category. */
export async function setConsent(category: ConsentCategory, audience: ConsentAudience): Promise<void> {
  await trpc.consent.set.mutate({ category, audience });
}
