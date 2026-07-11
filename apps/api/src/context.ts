/**
 * tRPC request context. Verifies the Supabase JWT from the Authorization
 * header and loads the user's id + role from the database. No/invalid token
 * yields `user: null` (procedures decide whether that's allowed).
 */
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import type { Role } from "@prisma/client";
import { createRemoteJWKSet } from "jose";
import { prisma } from "./db";
import { getBearerToken, verifySupabaseJwt, type JwtVerifier } from "./auth";
import { env } from "./env";

export type ContextUser = { id: string; role: Role };
export type Context = { user: ContextUser | null };

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
    select: { id: true, role: true },
  });
  return user ?? null;
}

export async function createContext({ req }: CreateHTTPContextOptions): Promise<Context> {
  const token = getBearerToken(req.headers["authorization"]);
  const user = await resolveUser(token);
  return { user };
}
