/**
 * Invitation authorization and redemption rules.
 *
 * The invite code is the credential that connects a client to a staff member,
 * and the link it creates is what later permits reading that person's data — so
 * these cover who may mint one, who may redeem one, and every way a code must
 * stop working.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  clientInvite: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  staffLink: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("../db", () => ({ prisma: db }));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const STAFF = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const INVITE = "33333333-3333-4333-8333-333333333333";
const CODE = "ACDEFGHJ";

const staffCtx = ctx({ id: STAFF, role: "USER", staff: ["PT"], email: "pt@example.test" });
const clientCtx = ctx({ id: CLIENT, role: "USER", email: "client@example.test" });

/** A redeemable invitation, unless a field is overridden. */
function invite(over: Record<string, unknown> = {}) {
  return {
    id: INVITE,
    staffId: STAFF,
    kind: "PT",
    email: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    acceptedAt: null,
    revokedAt: null,
    ...over,
  };
}

beforeEach(() => {
  for (const model of Object.values(db)) {
    if (typeof model === "function") model.mockReset();
    else for (const fn of Object.values(model)) fn.mockReset();
  }
  // Run the transaction body against the same mocks.
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.clientInvite.updateMany.mockResolvedValue({ count: 1 });
  db.staffLink.upsert.mockResolvedValue({});
});

describe("invites.create", () => {
  it("requires a staff capability", async () => {
    const caller = appRouter.createCaller(ctx({ id: CLIENT, role: "USER" }));
    await expect(caller.invites.create({ kind: "PT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to mint a capacity the caller doesn't hold", async () => {
    // A PT minting a PRACTITIONER invite would create a link with a far wider
    // data ceiling than they were ever granted.
    const caller = appRouter.createCaller(staffCtx);
    await expect(caller.invites.create({ kind: "PRACTITIONER" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.clientInvite.create).not.toHaveBeenCalled();
  });

  it("returns the plaintext code but stores only a hash", async () => {
    db.clientInvite.create.mockResolvedValue({
      id: INVITE,
      kind: "PT",
      email: null,
      expiresAt: new Date(),
      createdAt: new Date(),
    });
    const caller = appRouter.createCaller(staffCtx);
    const res = await caller.invites.create({ kind: "PT" });

    expect(res.code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{8}$/);
    const written = db.clientInvite.create.mock.calls[0]?.[0]?.data;
    expect(written.codeHash).toMatch(/^[0-9a-f]{64}$/);
    // The plaintext must never be persisted.
    expect(JSON.stringify(written)).not.toContain(res.code);
  });

  it("lower-cases an email lock so matching is case-insensitive", async () => {
    db.clientInvite.create.mockResolvedValue({
      id: INVITE, kind: "PT", email: "a@b.com", expiresAt: new Date(), createdAt: new Date(),
    });
    const caller = appRouter.createCaller(staffCtx);
    await caller.invites.create({ kind: "PT", email: "A@B.com" });
    expect(db.clientInvite.create.mock.calls[0]?.[0]?.data?.email).toBe("a@b.com");
  });

  it("never records the code in the audit trail", async () => {
    db.clientInvite.create.mockResolvedValue({
      id: INVITE, kind: "PT", email: null, expiresAt: new Date(), createdAt: new Date(),
    });
    const caller = appRouter.createCaller(staffCtx);
    const res = await caller.invites.create({ kind: "PT" });
    const audited = JSON.stringify(db.auditLog.create.mock.calls);
    expect(audited).not.toContain(res.code);
  });
});

describe("invites.accept", () => {
  it("rejects an unknown code", async () => {
    db.clientInvite.findUnique.mockResolvedValue(null);
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.accept({ code: CODE })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an expired code", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite({ expiresAt: new Date(Date.now() - 1000) }));
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.accept({ code: CODE })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That code has expired.",
    });
    expect(db.staffLink.upsert).not.toHaveBeenCalled();
  });

  it("rejects an already-used code", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite({ acceptedAt: new Date() }));
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.accept({ code: CODE })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.staffLink.upsert).not.toHaveBeenCalled();
  });

  it("rejects a revoked code", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite({ revokedAt: new Date() }));
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.accept({ code: CODE })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses self-acceptance", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite());
    const caller = appRouter.createCaller(staffCtx); // the issuer
    await expect(caller.invites.accept({ code: CODE })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.staffLink.upsert).not.toHaveBeenCalled();
  });

  it("enforces an email lock against the account, not the token", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite({ email: "someone@else.test" }));
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.accept({ code: CODE })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.staffLink.upsert).not.toHaveBeenCalled();
  });

  it("matches an email lock case-insensitively", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite({ email: "client@example.test" }));
    const caller = appRouter.createCaller(
      ctx({ id: CLIENT, role: "USER", email: "CLIENT@Example.Test" }),
    );
    await expect(caller.invites.accept({ code: CODE })).resolves.toMatchObject({ ok: true });
  });

  it("creates an ACTIVE link in the invited capacity", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite());
    const caller = appRouter.createCaller(clientCtx);
    await caller.invites.accept({ code: CODE });

    const args = db.staffLink.upsert.mock.calls[0]?.[0];
    expect(args.create).toMatchObject({
      clientId: CLIENT,
      staffId: STAFF,
      kind: "PT",
      status: "ACTIVE",
    });
    // The legacy NOT NULL column must still be populated until it's dropped.
    expect(args.create.role).toBe("PT");
  });

  it("spends the code conditionally, so a race can't produce two links", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite());
    const caller = appRouter.createCaller(clientCtx);
    await caller.invites.accept({ code: CODE });

    const where = db.clientInvite.updateMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: INVITE, acceptedAt: null, revokedAt: null });
  });

  it("creates no link when the conditional spend loses the race", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite());
    db.clientInvite.updateMany.mockResolvedValue({ count: 0 });
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.accept({ code: CODE })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.staffLink.upsert).not.toHaveBeenCalled();
  });

  it("grants no consent — connection and disclosure stay separate", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite());
    const caller = appRouter.createCaller(clientCtx);
    await caller.invites.accept({ code: CODE });
    // Accepting must never write a Consent row; the client shares later, or not.
    expect(JSON.stringify(db.staffLink.upsert.mock.calls)).not.toContain("consent");
  });

  it("rejects a malformed code before touching the database", async () => {
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.accept({ code: "OOOO0000" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.clientInvite.findUnique).not.toHaveBeenCalled();
  });

  it("normalises a code typed with a dash and lower case", async () => {
    db.clientInvite.findUnique.mockResolvedValue(invite());
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.accept({ code: "acde-fghj" })).resolves.toMatchObject({ ok: true });
  });
});

describe("invites.revoke", () => {
  it("is scoped to the caller's own invitations", async () => {
    db.clientInvite.updateMany.mockResolvedValue({ count: 0 });
    const caller = appRouter.createCaller(staffCtx);
    await expect(caller.invites.revoke({ id: INVITE })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.clientInvite.updateMany.mock.calls[0]?.[0]?.where).toMatchObject({ staffId: STAFF });
  });

  it("won't revoke one that's already been accepted", async () => {
    db.clientInvite.updateMany.mockResolvedValue({ count: 1 });
    const caller = appRouter.createCaller(staffCtx);
    await caller.invites.revoke({ id: INVITE });
    expect(db.clientInvite.updateMany.mock.calls[0]?.[0]?.where).toMatchObject({ acceptedAt: null });
  });

  it("requires staff capability", async () => {
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.revoke({ id: INVITE })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("invites.disconnect", () => {
  it("revokes rather than deletes, so the audit trail stays truthful", async () => {
    db.staffLink.updateMany.mockResolvedValue({ count: 1 });
    const caller = appRouter.createCaller(clientCtx);
    await caller.invites.disconnect({ id: INVITE });

    const call = db.staffLink.updateMany.mock.calls[0]?.[0];
    expect(call.data).toEqual({ status: "REVOKED" });
    // Scoped to the caller as the CLIENT — nobody can end someone else's link.
    expect(call.where).toMatchObject({ id: INVITE, clientId: CLIENT, status: "ACTIVE" });
  });

  it("is NOT_FOUND when the link isn't the caller's", async () => {
    db.staffLink.updateMany.mockResolvedValue({ count: 0 });
    const caller = appRouter.createCaller(clientCtx);
    await expect(caller.invites.disconnect({ id: INVITE })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("invites.preview", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.invites.preview({ code: CODE })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("reports state without revealing the locked address", async () => {
    db.clientInvite.findUnique.mockResolvedValue({
      ...invite({ email: "someone@else.test" }),
      staff: { fullName: "Sam Trainer", email: "pt@example.test" },
    });
    const caller = appRouter.createCaller(clientCtx);
    const res = await caller.invites.preview({ code: CODE });

    expect(res).toMatchObject({ state: "active", kind: "PT", from: "Sam Trainer", wrongAccount: true });
    // The third party's address must not leak to whoever holds the code.
    expect(JSON.stringify(res)).not.toContain("someone@else.test");
  });
});
