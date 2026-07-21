/**
 * Coach-plan parsing + authorization. `parsePlan` is the pure guard that keeps
 * unvalidated model output from reaching the client; the authz cases confirm the
 * plan mutation sits behind the same USER-role middleware as the rest of the
 * assistant router (no DB / no Groq call is reached in these).
 */
import { describe, it, expect } from "vitest";
import { parsePlan } from "../routers/assistant";
import { appRouter } from "../router";
import { ctx } from "./testContext";


describe("parsePlan", () => {
  it("accepts a well-formed plan", () => {
    const raw = JSON.stringify({
      title: "Easy day",
      intro: "Readiness is a little low, so let's keep it gentle.",
      blocks: [
        { label: "Move", detail: "A 20-minute walk is plenty today." },
        { label: "Recover", detail: "Aim for lights-out by 22:30." },
      ],
    });
    const plan = parsePlan(raw);
    expect(plan).not.toBeNull();
    expect(plan!.title).toBe("Easy day");
    expect(plan!.blocks).toHaveLength(2);
  });

  it("returns null for non-JSON", () => {
    expect(parsePlan("Sure! Here is your plan: ...")).toBeNull();
  });

  it("returns null when the shape is wrong (no blocks)", () => {
    expect(parsePlan(JSON.stringify({ title: "x", intro: "y", blocks: [] }))).toBeNull();
  });

  it("returns null when a block is missing a field", () => {
    const raw = JSON.stringify({ title: "x", intro: "y", blocks: [{ label: "Move" }] });
    expect(parsePlan(raw)).toBeNull();
  });
});

describe("plan authorization", () => {
  it("no token → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.assistant.plan({ focus: "balanced" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });


  it("rejects an unknown focus value", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    // @ts-expect-error — focus must be one of the enum values
    await expect(caller.assistant.plan({ focus: "bulk" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
