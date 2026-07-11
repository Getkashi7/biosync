/**
 * Authorization middleware via the router's createCaller — no DB needed:
 * we hand-build the context (as createContext would produce) and assert the
 * three required outcomes plus a passing protected call.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import type { Context } from "../context";

const ctx = (user: Context["user"]): Context => ({ user });

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
