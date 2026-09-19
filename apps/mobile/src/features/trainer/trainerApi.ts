/**
 * Data layer for the trainer surface. Everything here is already scope-limited
 * server-side: the API only returns categories the client consented to share
 * with this role, capped by what a trainer may ever see.
 */
import { trpc } from "../../lib/trpc";

export type RosterClient = Awaited<ReturnType<typeof trpc.staff.clients.query>>["clients"][number];
export type ClientDetail = Awaited<ReturnType<typeof trpc.staff.client.query>>;

/** The trainer's active clients, with their consent-gated engagement summary. */
export async function fetchClients(): Promise<RosterClient[]> {
  const res = await trpc.staff.clients.query();
  return res.clients;
}

/** One client's permitted data. Throws NOT_FOUND when there's no active link. */
export async function fetchClient(clientId: string): Promise<ClientDetail> {
  return trpc.staff.client.query({ clientId });
}

/** Write a session note. `shared` decides whether the client can read it. */
export async function addNote(clientId: string, body: string, shared: boolean): Promise<void> {
  await trpc.training.addNote.mutate({ clientId, body, sharedWithClient: shared });
}

export type TrainingPlan = Awaited<ReturnType<typeof trpc.training.plans.query>>["plans"][number];

/** Plans this trainer has written for a client. */
export async function fetchPlans(clientId: string): Promise<TrainingPlan[]> {
  const res = await trpc.training.plans.query({ clientId });
  return res.plans;
}

export type NewPlanItem = { name: string; sets: number; reps: number };

/** Create or replace the plan for a client's week. */
export async function savePlan(
  clientId: string,
  week: string,
  title: string,
  items: NewPlanItem[],
): Promise<void> {
  await trpc.training.savePlan.mutate({ clientId, week, title, items });
}

export type ClientPhotos = Awaited<ReturnType<typeof trpc.photos.clientList.query>>;
export type ClientPhoto = ClientPhotos["photos"][number];

/**
 * One client's progress photos, if they've shared them with you.
 *
 * **Loaded on demand, never on screen open.** The server audits this read under
 * its own action, and a trail that records a photo view every time somebody
 * glanced at a client's page says nothing about who actually looked. Tapping is
 * the signal worth recording.
 *
 * `shared: false` means the consent isn't there — a different thing from an
 * empty gallery, and the screen must not collapse the two.
 */
export async function fetchClientPhotos(clientId: string): Promise<ClientPhotos> {
  return trpc.photos.clientList.query({ clientId });
}
