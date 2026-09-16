/**
 * Keyset cursors for paging append-only lists.
 *
 * Offset pagination is wrong for a growing table: rows arrive while someone is
 * reading, so page 2 silently repeats or skips entries. A keyset cursor carries
 * the last row's sort position instead, so the next page continues from exactly
 * where the previous one stopped whatever has been written since.
 *
 * `createdAt` alone cannot be that position — it is not unique, and two rows
 * written in the same millisecond would make one of them unreachable. So a
 * cursor is the timestamp AND the id, and callers order by both.
 *
 * **`decodeCursor` never throws and never guesses.** A malformed cursor returns
 * null, and the caller's contract is to reject it — a cursor that silently
 * degrades to "start from the beginning" turns a paging bug into an unfiltered
 * dump of the whole table, which on the audit trail or the member list is
 * precisely the outcome these surfaces are built to prevent.
 */

export type Cursor = {
  /** the last row's sort timestamp */
  at: Date;
  /** the last row's id, breaking ties within the same instant */
  id: string;
};

/** Opaque to the client: a base64url blob, not a URL to be hand-edited. */
export function encodeCursor(c: Cursor): string {
  const raw = `${c.at.toISOString()}|${c.id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

/**
 * Parse a cursor, or null if it is anything other than one we wrote.
 *
 * Validates the shape rather than trusting it: a caller could hand us any
 * string, and an `Invalid Date` reaching a Prisma `where` is a query that
 * matches nothing at best and errors at worst.
 */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 256) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const sep = decoded.indexOf("|");
  if (sep <= 0) return null;
  const iso = decoded.slice(0, sep);
  const id = decoded.slice(sep + 1);
  if (id.length === 0 || id.length > 64) return null;

  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  // Round-trip the timestamp: `new Date("2026")` parses, but re-encoding it
  // would not reproduce the cursor, so paging would drift.
  if (at.toISOString() !== iso) return null;

  return { at, id };
}

/**
 * The `where` fragment that continues a descending `[createdAt, id]` ordering.
 *
 * Returned as a plain object rather than applied, so the caller composes it
 * with its own filters and stays the only place that touches Prisma.
 */
export function keysetWhere(
  cursor: Cursor | null,
  field = "createdAt",
): Record<string, unknown> | undefined {
  if (cursor === null) return undefined;
  return {
    OR: [
      { [field]: { lt: cursor.at } },
      { [field]: cursor.at, id: { lt: cursor.id } },
    ],
  };
}

/**
 * The cursor for the next page, or null when this page is the last one.
 *
 * Takes one more row than the page size and asks whether it arrived: a count
 * query to answer "is there more" costs a second scan of a growing table for
 * information one extra row already carries.
 */
export function nextCursor<T extends { id: string }>(
  rows: T[],
  limit: number,
  at: (row: T) => Date,
): { page: T[]; cursor: string | null } {
  if (rows.length <= limit) return { page: rows, cursor: null };
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  if (!last) return { page, cursor: null };
  return { page, cursor: encodeCursor({ at: at(last), id: last.id }) };
}
