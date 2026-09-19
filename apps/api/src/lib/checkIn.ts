/**
 * Check-in token signing — the half `@pulse/shared` deliberately does not hold.
 *
 * Shared decides *which payloads are currently in date*; this module is the only
 * place that knows a venue's secret, computes an HMAC, or compares one. That
 * split is a step further than `invites.ts`, which takes a randomness callback
 * but still owns its own shape checks — here shared never sees a key and never
 * performs an equality test.
 *
 * **What this proves, and what it does not.** A rotating token proves presence
 * only if the QR is on a display that refreshes. A printed poster is static, and
 * a photo of one checks somebody in from their sofa. That is why `CheckInSource`
 * records how a visit was recorded, and why nothing financial keys off a
 * check-in. Do not let a `QR` source later be treated as attestation.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { expectedCheckInPayloads, parseCheckInToken } from "@pulse/shared";

/** Truncated to keep the QR small; 12 base32-ish chars is ~60 bits. */
const MAC_LENGTH = 12;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url").slice(0, MAC_LENGTH);
}

/** The token a venue display should be showing right now. */
export function currentToken(venueId: string, secret: string, nowMs: number = Date.now()): string {
  const window = Math.floor(nowMs / 1000 / 60);
  return `BIOSYNC1:${venueId}:${window}:${sign(secret, `${venueId}:${window}`)}`;
}

/** Constant-time compare, so a wrong mac leaks nothing through timing. */
function macMatches(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Whether a scanned token is genuinely this venue's, right now.
 *
 * Returns the venue id rather than a boolean so the caller cannot accidentally
 * trust the id it parsed out of untrusted input before verifying the mac.
 */
export function verifyCheckInToken(
  raw: string,
  secretFor: (venueId: string) => string | null,
  nowMs: number = Date.now(),
): { venueId: string } | null {
  const parsed = parseCheckInToken(raw);
  if (!parsed) return null;

  const secret = secretFor(parsed.venueId);
  if (!secret) return null;

  // Shared says which windows are acceptable; we sign each and compare.
  for (const payload of expectedCheckInPayloads(parsed.venueId, Math.floor(nowMs / 1000))) {
    if (macMatches(sign(secret, payload), parsed.mac)) return { venueId: parsed.venueId };
  }
  return null;
}
