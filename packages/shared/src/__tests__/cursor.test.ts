/**
 * Keyset cursors.
 *
 * The assertion that matters most is the one about malformed input. A cursor
 * that silently degrades to "start from the beginning" turns a paging bug into
 * an unfiltered dump — and the two surfaces that use this are the audit trail
 * and the member list, which are exactly the two places that must never dump.
 */
import { describe, it, expect } from "vitest";
import { decodeCursor, encodeCursor, keysetWhere, nextCursor } from "../cursor";

const AT = new Date("2026-09-16T11:22:33.444Z");
const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("round trip", () => {
  it("survives encode → decode exactly", () => {
    const back = decodeCursor(encodeCursor({ at: AT, id: ID }));
    expect(back?.at.toISOString()).toBe(AT.toISOString());
    expect(back?.id).toBe(ID);
  });

  it("is opaque — not a readable date the caller might hand-edit", () => {
    const c = encodeCursor({ at: AT, id: ID });
    expect(c).not.toContain("2026");
    expect(c).not.toContain(ID);
  });
});

describe("decodeCursor refuses anything it did not write", () => {
  // Each of these must be null, and the caller turns null into BAD_REQUEST.
  // None may be mistaken for "no cursor", which means page one.
  const bad: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["not base64", "!!!!!"],
    ["no separator", Buffer.from("nopipe", "utf8").toString("base64url")],
    ["empty id", Buffer.from("2026-09-16T00:00:00.000Z|", "utf8").toString("base64url")],
    ["empty date", Buffer.from("|abc", "utf8").toString("base64url")],
    ["unparseable date", Buffer.from("never|abc", "utf8").toString("base64url")],
    ["absurdly long", "a".repeat(300)],
  ];

  for (const [name, value] of bad) {
    it(`returns null for ${name}`, () => {
      expect(decodeCursor(value as string)).toBeNull();
    });
  }

  /**
   * `new Date("2026")` parses happily but re-encodes as a full ISO string, so a
   * cursor built from it would not continue from where it claimed — paging
   * would drift by up to a year.
   */
  it("rejects a date that parses but does not round-trip", () => {
    expect(decodeCursor(Buffer.from("2026|abc", "utf8").toString("base64url"))).toBeNull();
  });
});

describe("keysetWhere", () => {
  it("is undefined with no cursor, so page one carries no extra filter", () => {
    expect(keysetWhere(null)).toBeUndefined();
  });

  // Strictly-less on the timestamp, with the id breaking ties inside the same
  // instant — without the second leg, rows sharing a millisecond are skipped.
  it("continues a descending order without skipping a shared timestamp", () => {
    expect(keysetWhere({ at: AT, id: ID })).toEqual({
      OR: [{ createdAt: { lt: AT } }, { createdAt: AT, id: { lt: ID } }],
    });
  });

  it("can key off another column", () => {
    const w = keysetWhere({ at: AT, id: ID }, "bookedAt") as { OR: Record<string, unknown>[] };
    expect(w.OR[0]).toHaveProperty("bookedAt");
  });
});

describe("nextCursor", () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({
    id: `id-${i}`,
    createdAt: new Date(AT.getTime() - i * 1000),
  }));
  const at = (r: (typeof rows)[number]) => r.createdAt;

  it("reports no more pages when the extra row did not arrive", () => {
    const { page, cursor } = nextCursor(rows.slice(0, 3), 3, at);
    expect(page).toHaveLength(3);
    expect(cursor).toBeNull();
  });

  // Taking limit+1 answers "is there more" without a second count query over a
  // table that only grows.
  it("trims the probe row and points at the last row of the page", () => {
    const { page, cursor } = nextCursor(rows, 3, at);
    expect(page).toHaveLength(3);
    expect(page[2]!.id).toBe("id-2");
    expect(decodeCursor(cursor)?.id).toBe("id-2");
  });

  it("handles an empty result", () => {
    expect(nextCursor([], 3, at)).toEqual({ page: [], cursor: null });
  });
});
