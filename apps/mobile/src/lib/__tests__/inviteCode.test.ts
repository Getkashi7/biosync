/**
 * Invite-code formatting on the client.
 *
 * These mirror the server's rules (@pulse/shared `invites.ts`) because the
 * mobile app can't import that package's runtime code. That duplication is the
 * risk these tests exist to cover: if the two ever disagree about what a code
 * looks like, a perfectly good code gets rejected before it's ever sent.
 */
import { describe, it, expect } from "vitest";
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  formatInviteCode,
  normaliseInviteCode,
} from "../format";

describe("normaliseInviteCode", () => {
  it("upper-cases what the user types", () => {
    expect(normaliseInviteCode("acdefghj")).toBe("ACDEFGHJ");
  });

  it("drops the separators people paste", () => {
    expect(normaliseInviteCode("ACDE-FGHJ")).toBe("ACDEFGHJ");
    expect(normaliseInviteCode("ACDE FGHJ")).toBe("ACDEFGHJ");
    expect(normaliseInviteCode("  acde-fghj  ")).toBe("ACDEFGHJ");
  });

  it("drops look-alike characters rather than mapping them", () => {
    // Silently turning O into 0 would let a typo redeem someone else's code.
    for (const ch of ["O", "I", "L", "S", "B", "Z", "0", "1", "2", "5", "8"]) {
      expect(INVITE_ALPHABET.includes(ch)).toBe(false);
      expect(normaliseInviteCode(ch)).toBe("");
    }
  });

  it("caps at the code length, so extra keystrokes can't overflow the field", () => {
    expect(normaliseInviteCode("ACDEFGHJKMNP")).toHaveLength(INVITE_CODE_LENGTH);
    expect(normaliseInviteCode("ACDEFGHJKMNP")).toBe("ACDEFGHJ");
  });

  it("is idempotent", () => {
    expect(normaliseInviteCode(normaliseInviteCode("acde-fghj"))).toBe("ACDEFGHJ");
  });

  it("returns empty for input with nothing usable in it", () => {
    expect(normaliseInviteCode("!!!")).toBe("");
    expect(normaliseInviteCode("")).toBe("");
  });
});

describe("formatInviteCode", () => {
  it("groups a full code into two blocks of four", () => {
    expect(formatInviteCode("ACDEFGHJ")).toBe("ACDE-FGHJ");
  });

  it("normalises first, so display is stable however it was typed", () => {
    expect(formatInviteCode("acde fghj")).toBe("ACDE-FGHJ");
    expect(formatInviteCode("ACDE-FGHJ")).toBe("ACDE-FGHJ");
  });

  it("leaves a partial code ungrouped until the dash is earned", () => {
    expect(formatInviteCode("ACD")).toBe("ACD");
    expect(formatInviteCode("ACDE")).toBe("ACDE");
  });

  it("adds the dash as soon as a fifth character arrives", () => {
    expect(formatInviteCode("ACDEF")).toBe("ACDE-F");
  });

  it("never lets typing run past the grouped form", () => {
    expect(formatInviteCode("ACDEFGHJKMNP")).toBe("ACDE-FGHJ");
  });
});
