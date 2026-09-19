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

/* ------------------------------------------------------------------ */
/* §10 — reading the trail, browsing members, trends, venues           */
/* ------------------------------------------------------------------ */

export type AuditPage = Awaited<ReturnType<typeof trpc.admin.auditLog.query>>;
export type AuditRow = AuditPage["entries"][number];
export type MemberPage = Awaited<ReturnType<typeof trpc.admin.members.query>>;
export type Member = MemberPage["members"][number];
export type Trends = Awaited<ReturnType<typeof trpc.admin.trends.query>>;
export type TrendPoint = Trends["series"]["signups"][number];
export type Revenue = Awaited<ReturnType<typeof trpc.admin.revenue.query>>;
export type AdminVenue = Awaited<ReturnType<typeof trpc.admin.venues.query>>["venues"][number];

/**
 * A page of the audit trail.
 *
 * Reading it is itself audited — but only the first page, so the trail does not
 * become a record of somebody scrolling. That happens server-side; nothing here
 * needs to know, and nothing here may suppress it.
 */
export async function fetchAuditLog(input: {
  actorId?: string;
  subjectId?: string;
  action?: string;
  cursor?: string;
}): Promise<AuditPage> {
  return trpc.admin.auditLog.query(input);
}

/**
 * Browse members.
 *
 * `recent` takes no cursor at all, which is what makes it structurally unable
 * to walk the membership: you see the newest page and there is no next. Search
 * needs three characters, enforced at Zod before any query is built — the
 * screen mirrors that only to keep the button honest, never as the guard.
 */
export const MIN_SEARCH = 3;

export async function fetchMembers(input: {
  mode: "recent" | "search";
  q?: string;
  cursor?: string;
}): Promise<MemberPage> {
  return trpc.admin.members.query(input);
}

export async function setRole(userId: string, role: "USER" | "ADMIN"): Promise<void> {
  await trpc.admin.setRole.mutate({ userId, role });
}

export async function fetchTrends(days = 30): Promise<Trends> {
  return trpc.admin.trends.query({ days });
}

/**
 * Revenue, or an honest refusal.
 *
 * Throws PRECONDITION_FAILED when Stripe is not configured. The caller must
 * render that as "not switched on" with NO retry — a Retry that can only fail
 * is worse than no button, the same rule photo storage and the coach follow.
 */
export async function fetchRevenue(): Promise<Revenue> {
  return trpc.admin.revenue.query();
}

export async function fetchVenues(): Promise<AdminVenue[]> {
  const res = await trpc.admin.venues.query();
  return res.venues;
}

export async function saveVenue(input: {
  id?: string;
  name: string;
  address?: string | null;
  timezone: string;
  active: boolean;
}): Promise<void> {
  await trpc.admin.saveVenue.mutate(input as never);
}

export async function rotateVenueSecret(id: string): Promise<void> {
  await trpc.admin.rotateVenueSecret.mutate({ id });
}
