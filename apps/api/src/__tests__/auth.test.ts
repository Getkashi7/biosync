/**
 * Unit tests for the JWT verification path used by createContext.
 * Covers both legacy HS256 (secret) and asymmetric ES256 (JWKS) tokens —
 * signed locally with jose, no network, no DB.
 */
import { describe, it, expect } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type KeyLike } from "jose";
import { getBearerToken, verifySupabaseJwt } from "../auth";

const secret = "test-jwt-secret";
const enc = new TextEncoder();

async function signHS(payload: Record<string, unknown>, signingSecret = secret) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(enc.encode(signingSecret));
}

describe("getBearerToken", () => {
  it("parses a Bearer header", () => {
    expect(getBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("returns undefined for missing or non-Bearer headers", () => {
    expect(getBearerToken(undefined)).toBeUndefined();
    expect(getBearerToken("Basic abc")).toBeUndefined();
    expect(getBearerToken("Bearer")).toBeUndefined();
  });
});

describe("verifySupabaseJwt — legacy HS256", () => {
  it("extracts sub from a valid token", async () => {
    const token = await signHS({ sub: "user-123", role: "authenticated" });
    await expect(verifySupabaseJwt(token, { secret })).resolves.toEqual({ sub: "user-123" });
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = await signHS({ sub: "user-123" }, "wrong-secret");
    await expect(verifySupabaseJwt(token, { secret })).resolves.toBeNull();
  });

  it("rejects a garbage token", async () => {
    await expect(verifySupabaseJwt("not.a.jwt", { secret })).resolves.toBeNull();
  });

  it("returns null when sub is absent", async () => {
    const token = await signHS({ role: "authenticated" });
    await expect(verifySupabaseJwt(token, { secret })).resolves.toBeNull();
  });

  it("returns null for HS256 when no secret is configured", async () => {
    const token = await signHS({ sub: "user-123" });
    await expect(verifySupabaseJwt(token, {})).resolves.toBeNull();
  });
});

describe("verifySupabaseJwt — asymmetric ES256 (JWKS)", () => {
  async function makeEs256() {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    const jwks = createLocalJWKSet({ keys: [{ ...jwk, alg: "ES256", kid: "test-key" }] });
    return { privateKey, jwks };
  }

  async function signES(privateKey: KeyLike, payload: Record<string, unknown>) {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  }

  it("extracts sub from a valid ES256 token via JWKS", async () => {
    const { privateKey, jwks } = await makeEs256();
    const token = await signES(privateKey, { sub: "user-es256", role: "authenticated" });
    await expect(verifySupabaseJwt(token, { jwks })).resolves.toEqual({ sub: "user-es256" });
  });

  it("rejects an ES256 token signed by a different key", async () => {
    const { jwks } = await makeEs256();
    const other = await generateKeyPair("ES256");
    const token = await signES(other.privateKey, { sub: "user-es256" });
    await expect(verifySupabaseJwt(token, { jwks })).resolves.toBeNull();
  });

  it("returns null for ES256 when no JWKS is configured (secret only)", async () => {
    const { privateKey } = await makeEs256();
    const token = await signES(privateKey, { sub: "user-es256" });
    await expect(verifySupabaseJwt(token, { secret })).resolves.toBeNull();
  });
});
