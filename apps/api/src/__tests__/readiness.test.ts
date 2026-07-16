/**
 * Authorization + input validation for the readiness router, exercised through
 * createCaller with a hand-built context (no DB): every case here is rejected
 * by middleware or the Zod parser before any resolver touches Prisma. The
 * formula itself is covered in @pulse/shared's readiness tests.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import type { Context } from "../context";

const ctx = (user: Context["user"]): Context => ({ user });

describe("readiness authorization", () => {
  it("no token → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.readiness.today({ today: "2026-07-16" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("wrong role (ADMIN) → FORBIDDEN (requireRole USER)", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "ADMIN" }));
    await expect(caller.readiness.today({ today: "2026-07-16" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("readiness input validation", () => {
  it("rejects a malformed date", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(caller.readiness.today({ today: "07/16/2026" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
