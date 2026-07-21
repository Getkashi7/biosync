/**
 * Nutrition authorization + input validation. These cases stop before any DB or
 * Groq call is reached, so they run without a database: the middleware rejects
 * first, and Zod rejects malformed input at the tRPC boundary.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import { ctx } from "./testContext";


const validMeal = {
  date: "2026-07-19",
  description: "2 eggs and toast",
  calories: 420,
  proteinG: 24,
  carbsG: 30,
  fatG: 18,
  estimated: true,
};

describe("nutrition authorization", () => {
  it("no token → UNAUTHORIZED on every procedure", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.nutrition.day({ date: "2026-07-19" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.nutrition.estimate({ description: "toast" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.nutrition.log(validMeal)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

});

describe("nutrition input validation", () => {
  const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));

  it("rejects a malformed date", async () => {
    await expect(caller.nutrition.day({ date: "19-07-2026" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an empty meal description", async () => {
    await expect(caller.nutrition.log({ ...validMeal, description: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects negative and absurd macro values", async () => {
    await expect(caller.nutrition.log({ ...validMeal, proteinG: -1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.nutrition.log({ ...validMeal, calories: 99_999 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects a non-integer calorie count", async () => {
    await expect(caller.nutrition.log({ ...validMeal, calories: 420.5 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects an empty estimate description", async () => {
    await expect(caller.nutrition.estimate({ description: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a non-uuid meal id on remove", async () => {
    await expect(caller.nutrition.remove({ id: "not-a-uuid" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
