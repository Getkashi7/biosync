/**
 * Authorization middleware via the router's createCaller — no DB needed:
 * we hand-build the context (as createContext would produce) and assert the
 * three required outcomes plus a passing protected call.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import { router, ownerProcedure } from "../trpc";
import type { Context } from "../context";

const ctx = (user: Context["user"]): Context => ({ user });

/**
 * A stand-in for any consumer procedure. Consumer features are role-agnostic —
 * they scope to ctx.user.id — so this exercises the policy directly rather than
 * reaching a real router (and a real database) to prove it.
 */
const ownRouter = router({ whoami: ownerProcedure.query(({ ctx: c }) => c.user.role) });

describe("authorization", () => {
  it("correct role passes an admin procedure", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "ADMIN" }));
    await expect(caller.admin.stats()).resolves.toMatchObject({ users: expect.any(Number) });
  });

  it("wrong role → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(caller.admin.stats()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("no token → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("authenticated user resolves `me`", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(caller.me()).resolves.toEqual({ id: "u1", role: "USER" });
  });

  it("no token → UNAUTHORIZED even for admin routes (auth checked before role)", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.admin.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

/**
 * Consumer data belongs to whoever is signed in, whatever their role. Gating it
 * on `requireRole(USER)` made roles mutually exclusive — becoming a trainer
 * locked you out of your own check-ins, meals and coach. These lock in the fix.
 */
describe("ownerProcedure (own-data access)", () => {
  it("still requires a session", async () => {
    await expect(ownRouter.createCaller(ctx(null)).whoami()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lets any authenticated role reach their own data", async () => {
    for (const role of ["USER", "PT", "PRACTITIONER", "ADMIN"] as const) {
      const caller = ownRouter.createCaller(ctx({ id: "u1", role }));
      await expect(caller.whoami()).resolves.toBe(role);
    }
  });

  it("does not widen staff surfaces — those keep their own role check", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(caller.staff.clients()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
