/**
 * Training authorization + validation, and the rule that matters most: a client
 * can only ever read notes a trainer chose to share. These stop before any DB
 * call, so they run without a database.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import { ctx } from "./testContext";

const CLIENT = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

const validPlan = {
  clientId: CLIENT,
  week: "2026-W30",
  title: "Base week",
  items: [{ name: "Back squat", sets: 4, reps: 6 }],
};

describe("training authorization", () => {
  it("no token → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.training.plans({ clientId: CLIENT })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.training.myNotes()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a regular USER cannot reach the trainer-side procedures", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(caller.training.plans({ clientId: CLIENT })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.training.savePlan(validPlan)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.training.addNote({ clientId: CLIENT, body: "hi", sharedWithClient: true })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });

});

describe("plan validation", () => {
  const caller = appRouter.createCaller(ctx({ id: "s1", role: "USER", staff: ["PT"] }));

  it("rejects a malformed week", async () => {
    await expect(caller.training.savePlan({ ...validPlan, week: "week 30" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects an empty plan", async () => {
    await expect(caller.training.savePlan({ ...validPlan, items: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects nonsensical sets or reps", async () => {
    await expect(
      caller.training.savePlan({ ...validPlan, items: [{ name: "Squat", sets: 0, reps: 6 }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.training.savePlan({ ...validPlan, items: [{ name: "Squat", sets: 4, reps: 999 }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an empty note", async () => {
    await expect(
      caller.training.addNote({ clientId: CLIENT, body: "", sharedWithClient: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
