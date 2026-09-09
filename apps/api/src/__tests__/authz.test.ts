/**
 * Authorization middleware via the router's createCaller — no DB needed:
 * we hand-build the context (as createContext would produce) and assert the
 * three required outcomes plus a passing protected call.
 */
import { describe, it, expect, vi } from "vitest";
/**
 * `admin.stats` is a real aggregate query, and this file is otherwise DB-free.
 * Without this mock the very first test opened a connection to Supabase and
 * failed on latency rather than on policy — a test named
 * "correct role passes an admin procedure" must not be able to fail because a
 * free-tier database was slow. Counting is stubbed; the authorization it is
 * actually asserting runs for real.
 */
vi.mock("../db", () => ({
  prisma: {
    user: { count: async () => 0 },
    staffProfile: { count: async () => 0 },
    staffLink: { count: async () => 0 },
    clientInvite: { count: async () => 0 },
  },
}));

import { appRouter } from "../router";
import { router, ownerProcedure } from "../trpc";
import { ctx } from "./testContext";


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
    await expect(caller.me()).resolves.toEqual({
      id: "u1",
      email: "u1@example.test",
      role: "USER",
      staff: [],
    });
  });

  it("`me` reports staff capability, which is how the app picks a shell", async () => {
    const caller = appRouter.createCaller(ctx({ id: "s1", role: "USER", staff: ["PT"] }));
    await expect(caller.me()).resolves.toEqual({
      id: "s1",
      email: "s1@example.test",
      role: "USER",
      staff: [{ kind: "PT" }],
    });
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
