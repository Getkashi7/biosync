import { describe, it, expect } from "vitest";
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  buildInviteCode,
  formatInviteCode,
  inviteCodeInput,
  inviteCreateInput,
  inviteExpiry,
  inviteState,
  isInviteCodeShape,
  isRedeemable,
  normaliseInviteCode,
} from "../invites";

/** Deterministic byte source, for asserting on the mapping rather than luck. */
function bytesFrom(values: number[]): (n: number) => Uint8Array {
  let i = 0;
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let k = 0; k < n; k++) out[k] = values[i++ % values.length] ?? 0;
    return out;
  };
}

describe("normaliseInviteCode", () => {
  it("upper-cases and strips the separators people type", () => {
    expect(normaliseInviteCode("acde-fghj")).toBe("ACDEFGHJ");
    expect(normaliseInviteCode("ACDE FGHJ")).toBe("ACDEFGHJ");
    expect(normaliseInviteCode("  acde fghj  ")).toBe("ACDEFGHJ");
  });

  it("is idempotent — normalising twice changes nothing", () => {
    expect(normaliseInviteCode(normaliseInviteCode("acde-fghj"))).toBe("ACDEFGHJ");
  });
});

describe("isInviteCodeShape", () => {
  it("accepts a well-formed code", () => {
    expect(isInviteCodeShape("ACDEFGHJ")).toBe(true);
  });

  it("rejects wrong lengths", () => {
    expect(isInviteCodeShape("ACDEFGH")).toBe(false);
    expect(isInviteCodeShape("ACDEFGHJK")).toBe(false);
    expect(isInviteCodeShape("")).toBe(false);
  });

  it("rejects the look-alike characters left out of the alphabet", () => {
    // O/0, I/1, L, S/5, B/8, Z/2 are excluded precisely so they can't be typed
    for (const ch of ["O", "I", "L", "S", "B", "Z", "0", "1", "5", "8", "2"]) {
      expect(INVITE_ALPHABET.includes(ch)).toBe(false);
      expect(isInviteCodeShape(`ACDEFGH${ch}`)).toBe(false);
    }
  });

  it("rejects lower case — shape is checked after normalisation", () => {
    expect(isInviteCodeShape("acdefghj")).toBe(false);
  });
});

describe("buildInviteCode", () => {
  it("produces a code of the right shape", () => {
    const code = buildInviteCode(bytesFrom([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(isInviteCodeShape(code)).toBe(true);
  });

  it("maps bytes to the alphabet by index", () => {
    expect(buildInviteCode(bytesFrom([0, 1, 2, 3, 4, 5, 6, 7]))).toBe(
      INVITE_ALPHABET.slice(0, 8),
    );
  });

  it("discards the biased tail instead of folding it back with a modulo", () => {
    // 250 is the first byte outside 25×10=250, so it must be skipped entirely.
    // Were it taken as 250 % 25 = 0, the code would start with "A".
    const code = buildInviteCode(bytesFrom([250, 1, 1, 1, 1, 1, 1, 1, 1]));
    expect(code.startsWith("A")).toBe(false);
    expect(code[0]).toBe(INVITE_ALPHABET[1]);
  });

  it("keeps drawing until the code is complete when many bytes are discarded", () => {
    // Every byte in the first chunk is out of range; it must fetch more.
    const code = buildInviteCode(bytesFrom([255, 254, 253, 252, 251, 250, 9]));
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(isInviteCodeShape(code)).toBe(true);
  });

  it("only ever emits characters from the alphabet", () => {
    const seq = Array.from({ length: 64 }, (_, i) => i * 4);
    const code = buildInviteCode(bytesFrom(seq));
    for (const ch of code) expect(INVITE_ALPHABET).toContain(ch);
  });
});

describe("formatInviteCode", () => {
  it("groups into two blocks for display", () => {
    expect(formatInviteCode("ACDEFGHJ")).toBe("ACDE-FGHJ");
  });

  it("normalises before formatting, so display is stable", () => {
    expect(formatInviteCode("acde fghj")).toBe("ACDE-FGHJ");
  });

  it("leaves an unexpected length alone rather than mangling it", () => {
    expect(formatInviteCode("ACD")).toBe("ACD");
  });
});

describe("inviteState / isRedeemable", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  const future = new Date("2026-07-26T12:00:00Z");
  const past = new Date("2026-07-24T12:00:00Z");

  it("is active while unspent and unexpired", () => {
    const inv = { acceptedAt: null, revokedAt: null, expiresAt: future };
    expect(inviteState(inv, now)).toBe("active");
    expect(isRedeemable(inv, now)).toBe(true);
  });

  it("is expired once the deadline passes", () => {
    const inv = { acceptedAt: null, revokedAt: null, expiresAt: past };
    expect(inviteState(inv, now)).toBe("expired");
    expect(isRedeemable(inv, now)).toBe(false);
  });

  it("treats the exact expiry instant as expired", () => {
    const inv = { acceptedAt: null, revokedAt: null, expiresAt: now };
    expect(isRedeemable(inv, now)).toBe(false);
  });

  it("is single use — an accepted code can't be redeemed again", () => {
    const inv = { acceptedAt: past, revokedAt: null, expiresAt: future };
    expect(inviteState(inv, now)).toBe("accepted");
    expect(isRedeemable(inv, now)).toBe(false);
  });

  it("is revocable before use", () => {
    const inv = { acceptedAt: null, revokedAt: past, expiresAt: future };
    expect(inviteState(inv, now)).toBe("revoked");
    expect(isRedeemable(inv, now)).toBe(false);
  });

  it("reports acceptance ahead of revocation when both are set", () => {
    // Revoking after the fact must not read as "never used".
    const inv = { acceptedAt: past, revokedAt: past, expiresAt: future };
    expect(inviteState(inv, now)).toBe("accepted");
  });

  it("an accepted code stays spent even past its expiry", () => {
    const inv = { acceptedAt: past, revokedAt: null, expiresAt: past };
    expect(inviteState(inv, now)).toBe("accepted");
    expect(isRedeemable(inv, now)).toBe(false);
  });
});

describe("inviteExpiry", () => {
  it("is 72 hours out", () => {
    const now = new Date("2026-07-25T12:00:00Z");
    expect(inviteExpiry(now).toISOString()).toBe("2026-07-28T12:00:00.000Z");
  });
});

describe("input schemas", () => {
  it("normalises a typed code as part of parsing", () => {
    expect(inviteCodeInput.parse({ code: "acde-fghj" }).code).toBe("ACDEFGHJ");
  });

  it("rejects a malformed code", () => {
    expect(inviteCodeInput.safeParse({ code: "OOOO0000" }).success).toBe(false);
    expect(inviteCodeInput.safeParse({ code: "short" }).success).toBe(false);
  });

  it("accepts a bare kind and an optional email lock", () => {
    expect(inviteCreateInput.parse({ kind: "PT" })).toEqual({ kind: "PT" });
    expect(inviteCreateInput.parse({ kind: "PRACTITIONER", email: "a@b.com" }).email).toBe("a@b.com");
  });

  it("rejects a kind that isn't a staff capacity", () => {
    expect(inviteCreateInput.safeParse({ kind: "ADMIN" }).success).toBe(false);
    expect(inviteCreateInput.safeParse({ kind: "USER" }).success).toBe(false);
  });

  it("rejects a malformed email lock", () => {
    expect(inviteCreateInput.safeParse({ kind: "PT", email: "not-an-email" }).success).toBe(false);
  });
});
