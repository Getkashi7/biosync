/**
 * Supabase JWT verification.
 *
 * Supabase projects sign access tokens one of two ways:
 *  - New asymmetric signing keys (ES256/RS256) → verify against the project's
 *    public JWKS endpoint (/auth/v1/.well-known/jwks.json).
 *  - Legacy HS256 → verify with the project's JWT secret.
 * We branch on the token header's `alg` and support both.
 *
 * Pure functions — verifier material is injected, so tests need no network.
 */
import { decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from "jose";

export type JwtVerifier = {
  /** Legacy HS256 JWT secret (Settings → API → JWT Settings). */
  secret?: string;
  /** Key resolver for asymmetric keys (createRemoteJWKSet in prod). */
  jwks?: JWTVerifyGetKey;
};

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function getBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  return scheme === "Bearer" && value ? value : undefined;
}

/** Returns `{ sub }` for a valid token, or null if invalid/expired/tampered. */
export async function verifySupabaseJwt(token: string, verifier: JwtVerifier): Promise<{ sub: string } | null> {
  try {
    const { alg } = decodeProtectedHeader(token);

    let sub: unknown;
    if (alg === "HS256") {
      if (!verifier.secret) return null;
      const key = new TextEncoder().encode(verifier.secret);
      sub = (await jwtVerify(token, key, { algorithms: ["HS256"] })).payload.sub;
    } else {
      if (!verifier.jwks) return null;
      sub = (await jwtVerify(token, verifier.jwks, { algorithms: ["ES256", "RS256"] })).payload.sub;
    }

    return typeof sub === "string" ? { sub } : null;
  } catch {
    return null;
  }
}
