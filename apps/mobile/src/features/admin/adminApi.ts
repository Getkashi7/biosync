/**
 * Data layer for the admin surface.
 *
 * Everything here is admin-gated server-side; this file only shapes the calls.
 * Lookup is by full email address on purpose — see the note on `admin.findUser`
 * in the API. There is no "list all members" call, and adding one would need
 * thinking about rather than copying.
 */
import { trpc } from "../../lib/trpc";

export type StaffKind = "PT" | "PRACTITIONER";
export type FoundUser = Awaited<ReturnType<typeof trpc.admin.findUser.query>>["user"];
export type AdminStats = Awaited<ReturnType<typeof trpc.admin.stats.query>>;
export type StaffProfileRow = FoundUser["staffProfiles"][number];

export async function fetchStats(): Promise<AdminStats> {
  return trpc.admin.stats.query();
}

/** Exact-match lookup. Throws NOT_FOUND when there's no such account. */
export async function findUser(email: string): Promise<FoundUser> {
  const res = await trpc.admin.findUser.query({ email: email.trim().toLowerCase() });
  return res.user;
}

export async function grantStaff(userId: string, kind: StaffKind, credential?: string): Promise<void> {
  await trpc.admin.grantStaff.mutate(credential ? { userId, kind, credential } : { userId, kind });
}

export async function revokeStaff(userId: string, kind: StaffKind): Promise<void> {
  await trpc.admin.revokeStaff.mutate({ userId, kind });
}

/** The capability's current status, or null when the account has never held it. */
export function statusOf(user: FoundUser, kind: StaffKind): StaffProfileRow["status"] | null {
  return user.staffProfiles.find((p) => p.kind === kind)?.status ?? null;
}
