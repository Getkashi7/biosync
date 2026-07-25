/**
 * Client invitations — the codes that connect a client to a trainer.
 *
 * The code is a credential: whoever holds it can attach themselves to a staff
 * member's roster, and from there the client's own consent decisions govern
 * what gets shared. So the alphabet and length here are a security parameter,
 * not cosmetics.
 *
 * Pure logic only (no crypto, no DB) so the API and the client agree on what a
 * valid code looks like without the mobile app depending on server code.
 */
import { z } from "zod";

/**
 * Code alphabet: digits and uppercase letters, minus the pairs people misread
 * when a code is spoken aloud or typed off a screen — O/0, I/1, L, S/5, B/8,
 * Z/2. Removing them costs a little entropy and removes a whole class of
 * "the code doesn't work" support.
 */
export const INVITE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";

/** Characters per code. 8 × log2(25) ≈ 37 bits — far beyond guessing at these volumes. */
export const INVITE_CODE_LENGTH = 8;

/** How long a new invitation stays redeemable. */
export const INVITE_TTL_HOURS = 72;

/**
 * Canonical form of a typed code: uppercased, with spaces and dashes stripped.
 *
 * People retype these from a screenshot or a text message, so "acde-fghj" and
 * "ACDE FGHJ" must reach the same invitation. Normalisation happens on both
 * sides — the client for display, the server before hashing — which is exactly
 * why it lives here rather than in either one.
 */
export function normaliseInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Whether a normalised code could possibly be valid (shape only, not existence). */
export function isInviteCodeShape(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  return [...code].every((ch) => INVITE_ALPHABET.includes(ch));
}

/** "ACDEFGHJ" → "ACDE-FGHJ", for display only. Never store or compare this form. */
export function formatInviteCode(code: string): string {
  const c = normaliseInviteCode(code);
  if (c.length !== INVITE_CODE_LENGTH) return c;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/**
 * Build a code from a source of randomness supplied by the caller.
 *
 * The randomness is injected rather than taken from `Math.random` so the server
 * passes a CSPRNG (`crypto.randomBytes`) — a guessable invite code would let a
 * stranger join someone's roster. Rejection sampling keeps the distribution
 * uniform: taking `byte % 25` would make the first six letters modestly more
 * likely, and biased credentials are weaker than they look.
 */
export function buildInviteCode(randomBytes: (n: number) => Uint8Array): string {
  const max = Math.floor(256 / INVITE_ALPHABET.length) * INVITE_ALPHABET.length;
  let out = "";
  while (out.length < INVITE_CODE_LENGTH) {
    const chunk = randomBytes(INVITE_CODE_LENGTH);
    for (const byte of chunk) {
      if (byte >= max) continue; // discard the biased tail
      out += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
      if (out.length === INVITE_CODE_LENGTH) break;
    }
  }
  return out;
}

/** The capacity an invitation connects in. Mirrors Prisma's StaffKind. */
export const inviteKind = z.enum(["PT", "PRACTITIONER"]);

export const inviteCreateInput = z.object({
  kind: inviteKind,
  /**
   * Optional lock to one recipient. Lower-cased server-side; when present, only
   * that account may redeem the code even if someone else obtains it.
   */
  email: z.string().email().max(320).optional(),
});

/** A typed code, accepted in any spacing/case and normalised here. */
export const inviteCodeInput = z.object({
  code: z
    .string()
    .min(1)
    .max(32)
    .transform(normaliseInviteCode)
    .refine(isInviteCodeShape, { message: "That code doesn't look right." }),
});

export const inviteRevokeInput = z.object({ id: z.string().uuid() });

export type InviteKind = z.infer<typeof inviteKind>;
export type InviteCreateInput = z.infer<typeof inviteCreateInput>;
export type InviteCodeInput = z.infer<typeof inviteCodeInput>;

/** Lifecycle of an invitation, derived rather than stored (no state to drift). */
export type InviteState = "active" | "accepted" | "revoked" | "expired";

export function inviteState(
  invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): InviteState {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

/** Whether an invitation may still be redeemed right now. */
export function isRedeemable(
  invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): boolean {
  return inviteState(invite, now) === "active";
}

/** Expiry for a code minted now. */
export function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}
