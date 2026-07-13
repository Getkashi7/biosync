/**
 * Authorization + input validation for the logs router, exercised through
 * createCaller with a hand-built context (no DB): every case here is rejected
 * by middleware or the Zod parser before any resolver touches Prisma.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import type { Context } from "../context";

const ctx = (user: Context["user"]): Context => ({ user });

const validCheckin = {
  date: "2026-07-12",
  sleepHours: 7.5,
  sleepQuality: 4,
  energy: 3,
  mood: 4,
  weightKg: null,
};

describe("logs authorization", () => {
  it("no token → UNAUTHORIZED on checkin", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.logs.checkin(validCheckin)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("no token → UNAUTHORIZED on streak", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.logs.streak({ today: "2026-07-12" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("wrong role (ADMIN) → FORBIDDEN (requireRole USER)", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "ADMIN" }));
    await expect(caller.logs.checkin(validCheckin)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("logs input validation", () => {
  const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));

  it("rejects an out-of-range rating", async () => {
    await expect(caller.logs.checkin({ ...validCheckin, sleepQuality: 9 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects sleepHours off the 0.5 grid", async () => {
    await expect(caller.logs.checkin({ ...validCheckin, sleepHours: 7.3 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects a malformed date", async () => {
    await expect(caller.logs.streak({ today: "07/12/2026" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
