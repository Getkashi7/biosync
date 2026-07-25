/**
 * tRPC request context. Verifies the Supabase JWT from the Authorization
 * header and loads the user's id + role from the database. No/invalid token
 * yields `user: null` (procedures decide whether that's allowed).
 */
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { StaffStatus, type Role, type StaffKind } from "@prisma/client";
import { createRemoteJWKSet } from "jose";
import { prisma } from "./db";
import { getBearerToken, verifySupabaseJwt, type JwtVerifier } from "./auth";
import { env } from "./env";

/**
 * The staff capacities this account may act in *right now*.
 *
 * Only VERIFIED profiles land here — PENDING and SUSPENDED are filtered out at
 * the query, so no downstream code can accidentally treat an unapproved or
 * withdrawn application as permission.
 */
export type StaffCapability = { kind: StaffKind };

export type ContextUser = {
  id: string;
  /** platform role: USER or ADMIN. Says nothing about staff capability. */
  role: Role;
  staff: StaffCapability[];
};
export type Context = { user: ContextUser | null };

/**
 * The bare capability kinds, for matching against `StaffLink.kind`.
 *
 * Staff surfaces filter links by the capacity the caller actually holds, so
 * this shows up at every one of those query sites — worth a name rather than a
 * `.map` repeated six times, each of which would be a place to get it wrong.
 */
export function staffKinds(user: ContextUser): StaffKind[] {
  return user.staff.map((s) => s.kind);
}

// Built once: remote JWKS for asymmetric tokens (jose caches the keys),
// legacy secret for HS256 tokens.
const verifier: JwtVerifier = {
  secret: env.SUPABASE_JWT_SECRET || undefined,
  jwks: env.SUPABASE_URL
    ? createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
    : undefined,
};

/** Verifies a bearer token and resolves the matching user, or null. */
export async function resolveUser(token: string | undefined): Promise<ContextUser | null> {
  if (!token) return null;
  const payload = await verifySupabaseJwt(token, verifier);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      role: true,
      // Loaded with the user so capability costs no extra round-trip, and is
      // re-read every request — a granted or revoked capability takes effect
      // immediately, with no token refresh or sign-out.
      staffProfiles: {
        where: { status: StaffStatus.VERIFIED },
        select: { kind: true },
      },
    },
  });
  if (!user) return null;
  return { id: user.id, role: user.role, staff: user.staffProfiles };
}

export async function createContext({ req }: CreateHTTPContextOptions): Promise<Context> {
  const token = getBearerToken(req.headers["authorization"]);
  const user = await resolveUser(token);
  return { user };
}
