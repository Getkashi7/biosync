/**
 * Data layer for the morning digest. One call returns the assistant's greeting
 * plus the number-forward cards for the device-local today, end-to-end typed via
 * AppRouter. Kept apart from the screen so the UI stays presentation-only.
 */
import { trpc } from "../../lib/trpc";
import { todayLocal } from "../checkin/checkinApi";

export type Digest = Awaited<ReturnType<typeof trpc.assistant.digest.query>>;
export type DigestCard = Digest["cards"][number];

/** Fetch today's digest; an empty `cards` list means the client shows first-run. */
export async function fetchDigest(): Promise<Digest> {
  return trpc.assistant.digest.query({ today: todayLocal() });
}
