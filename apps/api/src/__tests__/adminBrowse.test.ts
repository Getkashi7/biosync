/**
 * §10's two browses, and the privacy line they had to cross carefully.
 *
 * `admin.findUser` refuses substring matching on purpose — `admin.ts` says why:
 * *"A substring match over this table would turn the admin surface into a bulk
 * export of everyone who uses the app — type 'a', receive the membership
 * list."* The user asked for a searchable list anyway, and asked for it without
 * losing that. So the reasoning had to survive as constraints rather than as a
 * comment, and these are those constraints.
 *
 * `findUser` itself is untouched, and `admin.test.ts:78` still guards it. That
 * test inspects `user.findUnique`; this one inspects `user.findMany`. They do
 * not overlap and neither should be "fixed" to match the other.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const userFindMany = vi.fn();
const userFindUnique = vi.fn();
const userCount = vi.fn();
const userUpdate = vi.fn();
const auditFindMany = vi.fn();
const auditCreate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    user: {
      findMany: (...a: unknown[]) => userFindMany(...a),
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      count: (...a: unknown[]) => userCount(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    auditLog: {
      findMany: (...a: unknown[]) => auditFindMany(...a),
      create: (...a: unknown[]) => auditCreate(...a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ user: { count: userCount, update: userUpdate } }),
  },
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

function admin() {
  return appRouter.createCaller(ctx({ id: ADMIN_ID, role: "ADMIN" })).admin;
}

beforeEach(() => {
  vi.clearAllMocks();
  userFindMany.mockResolvedValue([]);
  auditFindMany.mockResolvedValue([]);
  auditCreate.mockResolvedValue({});
  userCount.mockResolvedValue(2);
  userUpdate.mockResolvedValue({});
  userFindUnique.mockResolvedValue({ role: "USER" });
});

describe("who may browse", () => {
  it("refuses anonymous, plain users, and staff alike", async () => {
    await expect(appRouter.createCaller(ctx(null)).admin.members({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      appRouter.createCaller(ctx({ id: "u1", role: "USER" })).admin.members({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Being a practitioner is not running the platform.
    await expect(
      appRouter
        .createCaller(ctx({ id: "p1", role: "USER", staff: ["PRACTITIONER"] }))
        .admin.auditLog({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.members — the anti-enumeration bounds", () => {
  /**
   * This is "type 'a', receive the membership list", turned into a test. The
   * refusal must happen at Zod, before a query is constructed at all.
   */
  it("refuses a search shorter than three characters, before any query runs", async () => {
    for (const q of ["", "a", "ab", "  a  "]) {
      await expect(admin().members({ mode: "search", q }), q).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("matches on startsWith, never contains — a 3-char contains still lists everyone", async () => {
    await admin().members({ mode: "search", q: "ann" });
    const where = JSON.stringify(userFindMany.mock.calls[0]?.[0]?.where);
    expect(where).toContain("startsWith");
    expect(where).not.toContain("contains");
    expect(where).not.toContain("endsWith");
  });

  it("caps the page, so no single call returns the membership", async () => {
    await admin().members({ mode: "recent" });
    expect(userFindMany.mock.calls[0]?.[0]?.take).toBeLessThanOrEqual(26);
  });

  // `recent` answers "who joined this week". Accepting a cursor would turn it
  // into a way to walk backwards through every member ever.
  it("never pages the recent list", async () => {
    userFindMany.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({
        id: `id-${i}`,
        email: `a${i}@b.com`,
        fullName: null,
        role: "USER",
        createdAt: new Date(),
        staffProfiles: [],
      })),
    );
    const res = await admin().members({ mode: "recent" });
    expect(res.cursor).toBeNull();
  });

  it("does page a search, and refuses a cursor it did not write", async () => {
    await expect(
      admin().members({ mode: "search", q: "ann", cursor: "!!!not-ours!!!" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // A malformed cursor must never fall through to an unfiltered first page.
    expect(userFindMany).not.toHaveBeenCalled();
  });

  /**
   * `credential` is a professional registration number. It lives on
   * StaffProfile and has exactly one legitimate reader. Asserted at the select
   * level so it fails without a database.
   */
  it("never selects the credential, and never any health relation", async () => {
    await admin().members({ mode: "recent" });
    const select = JSON.stringify(userFindMany.mock.calls[0]?.[0]?.select);
    expect(select).not.toContain("credential");
    for (const health of ["dailyLogs", "metrics", "meals", "photos", "readinessSnapshots"]) {
      expect(select, health).not.toContain(health);
    }
  });

  it("records the browse, with the term that was searched for", async () => {
    await admin().members({ mode: "search", q: "ann" });
    const entry = auditCreate.mock.calls[0]?.[0]?.data;
    expect(entry.action).toBe("members.browsed");
    expect(entry.actorId).toBe(ADMIN_ID);
    expect(JSON.stringify(entry.meta)).toContain("ann");
  });
});

describe("admin.auditLog", () => {
  it("orders newest first, with the id breaking ties", async () => {
    await admin().auditLog({});
    expect(auditFindMany.mock.calls[0]?.[0]?.orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  // Unindexed on an append-only table: an entity filter is a scan that gets
  // slower every day the app runs.
  it("filters only on the indexed axes", async () => {
    await admin().auditLog({ actorId: OTHER_ID, action: "role.changed" });
    const where = JSON.stringify(auditFindMany.mock.calls[0]?.[0]?.where);
    expect(where).toContain(OTHER_ID);
    expect(where).toContain("role.changed");
    expect(where).not.toContain("entity");
  });

  it("refuses a malformed cursor rather than serving the whole trail", async () => {
    await expect(admin().auditLog({ cursor: "garbage" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(auditFindMany).not.toHaveBeenCalled();
  });

  /**
   * The one privileged read in the system with no other watcher — so it watches
   * itself. But only the query: auditing every page would make the trail a
   * record of scrolling through the trail.
   */
  it("records the first page and not the pages after it", async () => {
    await admin().auditLog({});
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0]?.[0]?.data?.action).toBe("audit.viewed");

    vi.clearAllMocks();
    auditFindMany.mockResolvedValue([]);
    const { encodeCursor } = await import("@pulse/shared");
    await admin().auditLog({ cursor: encodeCursor({ at: new Date(), id: OTHER_ID }) });
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("labels each action, and keeps the raw string for one it doesn't know", async () => {
    auditFindMany.mockResolvedValue([
      { id: "a", actorId: ADMIN_ID, subjectId: null, action: "role.changed", entity: null, entityId: null, meta: null, createdAt: new Date() },
      { id: "b", actorId: ADMIN_ID, subjectId: null, action: "from.the.future", entity: null, entityId: null, meta: null, createdAt: new Date() },
    ]);
    userFindMany.mockResolvedValue([{ id: ADMIN_ID, email: "a@b.com", fullName: "Ann" }]);
    const res = await admin().auditLog({});
    expect(res.entries[0]?.label).toBe("Changed a capability");
    expect(res.entries[1]?.label).toBe("from.the.future");
  });

  /**
   * The trail outlives the accounts it describes — that is why AuditLog has no
   * foreign key. A blank name would read as "nobody"; the truth is "an account
   * that has since been deleted", and that is itself information.
   */
  it("names a deleted account rather than rendering blank", async () => {
    auditFindMany.mockResolvedValue([
      { id: "a", actorId: OTHER_ID, subjectId: null, action: "account.deleted", entity: null, entityId: null, meta: null, createdAt: new Date() },
    ]);
    userFindMany.mockResolvedValue([]);
    const res = await admin().auditLog({});
    expect(res.entries[0]?.actor).toContain("deleted account");
    expect(res.entries[0]?.actor).not.toBe("");
  });
});

describe("admin.setRole", () => {
  it("refuses to change your own role", async () => {
    await expect(admin().setRole({ userId: ADMIN_ID, role: "USER" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  // Losing the last administrator is unrecoverable from inside the app.
  it("refuses to demote the last administrator", async () => {
    userFindUnique.mockResolvedValue({ role: "ADMIN" });
    userCount.mockResolvedValue(1);
    await expect(admin().setRole({ userId: OTHER_ID, role: "USER" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("allows it when another administrator remains", async () => {
    userFindUnique.mockResolvedValue({ role: "ADMIN" });
    userCount.mockResolvedValue(2);
    await expect(admin().setRole({ userId: OTHER_ID, role: "USER" })).resolves.toMatchObject({
      ok: true,
    });
  });

  /**
   * PT and PRACTITIONER exist in `Role` only for the legacy StaffLink column.
   * Writing one to `User.role` would revive the bug class where staff access
   * was decided by a role rather than a capability.
   */
  it("admits only the two platform roles", async () => {
    for (const role of ["PT", "PRACTITIONER", "SUPERUSER"]) {
      await expect(
        // @ts-expect-error deliberately outside the enum
        admin().setRole({ userId: OTHER_ID, role }),
        role,
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("records what changed, from and to", async () => {
    await admin().setRole({ userId: OTHER_ID, role: "ADMIN" });
    const entry = auditCreate.mock.calls[0]?.[0]?.data;
    expect(entry.action).toBe("role.changed");
    expect(entry.subjectId).toBe(OTHER_ID);
    expect(JSON.stringify(entry.meta)).toContain("ADMIN");
  });
});
