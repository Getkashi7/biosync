/**
 * The link gate — the rule that decides whether a staff member may touch a
 * client at all.
 *
 * These assert the *shape of the query*, not just its result, because the bug
 * this file exists to prevent was invisible at the result level: matching links
 * on `User.role` looked correct and passed every authorization test, but a
 * properly granted trainer keeps `role = USER`, so their links were never
 * found and their roster was silently empty forever. Only the demo account —
 * which still carried a legacy `role = PT` — appeared to work.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
vi.mock("../db", () => ({ prisma: { staffLink: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));

const { assertLinked } = await import("../lib/staffLink");

const STAFF = "s1";
const CLIENT = "c1";

beforeEach(() => {
  findFirst.mockReset();
});

describe("assertLinked", () => {
  it("matches on the link's kind, never on the platform role", async () => {
    findFirst.mockResolvedValue({ kind: "PT" });
    await assertLinked(STAFF, ["PT"], CLIENT);

    const where = findFirst.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      staffId: STAFF,
      clientId: CLIENT,
      kind: { in: ["PT"] },
      status: "ACTIVE",
    });
    // The regression itself: a role filter would exclude every properly
    // granted trainer, whose User.role is USER.
    expect(where).not.toHaveProperty("role");
  });

  it("returns the capacity the link is held in, so the caller applies the right ceiling", async () => {
    findFirst.mockResolvedValue({ kind: "PRACTITIONER" });
    await expect(assertLinked(STAFF, ["PT", "PRACTITIONER"], CLIENT)).resolves.toBe("PRACTITIONER");
  });

  it("considers every capacity the caller holds", async () => {
    findFirst.mockResolvedValue({ kind: "PT" });
    await assertLinked(STAFF, ["PT", "PRACTITIONER"], CLIENT);
    expect(findFirst.mock.calls[0]?.[0]?.where?.kind).toEqual({ in: ["PT", "PRACTITIONER"] });
  });

  it("only ever matches ACTIVE links", async () => {
    findFirst.mockResolvedValue({ kind: "PT" });
    await assertLinked(STAFF, ["PT"], CLIENT);
    // A pending invitation or a revoked link must not grant access.
    expect(findFirst.mock.calls[0]?.[0]?.where?.status).toBe("ACTIVE");
  });

  it("throws NOT_FOUND when there is no link", async () => {
    findFirst.mockResolvedValue(null);
    await expect(assertLinked(STAFF, ["PT"], CLIENT)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a caller with no capability WITHOUT querying", async () => {
    // An empty `in` clause must never be able to read as "match anything".
    await expect(assertLinked(STAFF, [], CLIENT)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("treats a link with no kind as no link", async () => {
    // `kind` is nullable for the length of the role→kind backfill; an unbackfilled
    // row must fail closed rather than be assumed to be a PT link.
    findFirst.mockResolvedValue({ kind: null });
    await expect(assertLinked(STAFF, ["PT"], CLIENT)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
