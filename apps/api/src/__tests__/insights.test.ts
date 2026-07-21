/**
 * Authorization + input validation for the insights router, exercised through
 * createCaller with a hand-built context (no DB): every case here is rejected by
 * middleware or the Zod parser before any resolver touches Prisma. The feed
 * generation itself is covered in @pulse/shared's insights tests.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import type { Context } from "../context";

const ctx = (user: Context["user"]): Context => ({ user });

describe("insights authorization", () => {
  it("no token → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.insights.list({ today: "2026-07-17" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

});

describe("insights input validation", () => {
  it("rejects a malformed date", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(caller.insights.list({ today: "07/17/2026" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
