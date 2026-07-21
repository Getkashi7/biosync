/**
 * Authorization + input validation for the goals router, exercised through
 * createCaller with a hand-built context (no DB): every case here is rejected
 * by middleware or the Zod parser before any resolver touches Prisma.
 */
import { describe, it, expect } from "vitest";
import { goalInput } from "@pulse/shared";
import { appRouter } from "../router";
import type { Context } from "../context";

const ctx = (user: Context["user"]): Context => ({ user });

const validGoal = { description: "Get resting HR under 55", targetMetric: "RESTING_HR" } as const;

describe("goals authorization", () => {
  it("no token → UNAUTHORIZED on set", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.goals.set(validGoal)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("no token → UNAUTHORIZED on list", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.goals.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

});

describe("goals input validation", () => {
  const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));

  it("rejects an empty description", async () => {
    await expect(caller.goals.set({ description: "   " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects an over-long description", async () => {
    await expect(caller.goals.set({ description: "x".repeat(201) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects an unknown target metric", async () => {
    await expect(
      caller.goals.set({ ...validGoal, targetMetric: "STEPS" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("drops a client-supplied userId — the owner comes from the session", () => {
    const parsed = goalInput.parse({ ...validGoal, userId: "someone-else" });
    expect(parsed).not.toHaveProperty("userId");
  });
});
