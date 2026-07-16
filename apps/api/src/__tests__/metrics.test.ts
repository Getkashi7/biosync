/**
 * Authorization + input validation for the metrics router, exercised through
 * createCaller with a hand-built context (no DB): every case here is rejected
 * by middleware or the Zod parser before any resolver touches Prisma.
 */
import { describe, it, expect } from "vitest";
import { metricLogInput } from "@pulse/shared";
import { appRouter } from "../router";
import type { Context } from "../context";

const ctx = (user: Context["user"]): Context => ({ user });

const validLog = {
  type: "RESTING_HR",
  value: 58,
} as const;

const validRange = {
  type: "RESTING_HR",
  from: "2026-07-09T00:00:00.000Z",
  to: "2026-07-16T00:00:00.000Z",
} as const;

describe("metrics authorization", () => {
  it("no token → UNAUTHORIZED on log", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.metrics.log(validLog)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("no token → UNAUTHORIZED on range", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.metrics.range(validRange)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("wrong role (ADMIN) → FORBIDDEN (requireRole USER)", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "ADMIN" }));
    await expect(caller.metrics.log(validLog)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("metrics input validation", () => {
  const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));

  it("rejects a value outside the type's range", async () => {
    await expect(caller.metrics.log({ ...validLog, value: 500 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("accepts the same value for a type whose range allows it", async () => {
    // 500 is nonsense for RESTING_HR but fine for HRV — the range is per type.
    expect(() => metricLogInput.parse({ type: "HRV", value: 500 })).not.toThrow();
  });

  it("rejects an unknown metric type", async () => {
    await expect(caller.metrics.log({ ...validLog, type: "BOGUS" } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects a non-ISO timestamp on range", async () => {
    await expect(caller.metrics.range({ ...validRange, from: "07/09/2026" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("metrics.list", () => {
  it("no token → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.metrics.list(validRange)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a non-ISO timestamp", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(caller.metrics.list({ from: "yesterday", to: validRange.to })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("metrics ownership", () => {
  it("drops a client-supplied userId — the owner comes from the session", () => {
    const parsed = metricLogInput.parse({ ...validLog, userId: "someone-else" });
    expect(parsed).not.toHaveProperty("userId");
  });
});
