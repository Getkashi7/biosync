/**
 * Supplements authorization + input validation. These stop before any DB or Groq
 * call, so they run without a database: the role middleware rejects first, then
 * Zod rejects malformed input at the tRPC boundary.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import { ctx } from "./testContext";


const validEntry = { name: "Vitamin D", dose: "2000 IU", timings: ["AM" as const] };

describe("supplements authorization", () => {
  it("no token → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.supplements.day({ date: "2026-07-20" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.supplements.add(validEntry)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.supplements.suggest({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

});

describe("supplements input validation", () => {
  const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));

  it("rejects an empty name or dose", async () => {
    await expect(caller.supplements.add({ ...validEntry, name: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.supplements.add({ ...validEntry, dose: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires at least one timing", async () => {
    await expect(caller.supplements.add({ ...validEntry, timings: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects an unknown timing", async () => {
    // @ts-expect-error — timing must be one of the enum values
    await expect(caller.supplements.add({ ...validEntry, timings: ["NOON"] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects a malformed date on the day query", async () => {
    await expect(caller.supplements.day({ date: "20-07-2026" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a non-uuid id", async () => {
    await expect(caller.supplements.remove({ id: "nope" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.supplements.setTaken({ id: "nope", date: "2026-07-20", timing: "AM", taken: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
