/**
 * §3 fitness — authorization, and the promise that a plan never eats your work.
 *
 * The rule worth guarding: a generated session becomes the user's the moment
 * they touch it. Generation fills gaps only, and `regenerate` deletes untouched
 * days only — a session someone ticked off, completed or rated is a record of
 * what they actually did, and rebuilding over it would destroy that.
 *
 * DB-free, like the rest of the API suite: Prisma is mocked and the assertions
 * are about the shape of the queries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const goalFindFirst = vi.fn();
const sessionFindMany = vi.fn();
const sessionFindFirst = vi.fn();
const sessionFindUnique = vi.fn();
const sessionCreateMany = vi.fn();
const sessionUpdate = vi.fn();
const sessionUpdateMany = vi.fn();
const sessionDeleteMany = vi.fn();
const snapshotFindUnique = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    goal: { findFirst: (...a: unknown[]) => goalFindFirst(...a) },
    readinessSnapshot: { findUnique: (...a: unknown[]) => snapshotFindUnique(...a) },
    fitnessSession: {
      findMany: (...a: unknown[]) => sessionFindMany(...a),
      findFirst: (...a: unknown[]) => sessionFindFirst(...a),
      findUnique: (...a: unknown[]) => sessionFindUnique(...a),
      createMany: (...a: unknown[]) => sessionCreateMany(...a),
      update: (...a: unknown[]) => sessionUpdate(...a),
      updateMany: (...a: unknown[]) => sessionUpdateMany(...a),
      deleteMany: (...a: unknown[]) => sessionDeleteMany(...a),
    },
  },
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const DATE = "2026-09-09"; // a Wednesday
const USER = "u1";

function caller(id = USER) {
  return appRouter.createCaller(ctx({ id, role: "USER" })).fitness;
}

beforeEach(() => {
  vi.clearAllMocks();
  goalFindFirst.mockResolvedValue({ description: "Get stronger", targetMetric: null });
  snapshotFindUnique.mockResolvedValue({ score: 65 });
  sessionFindMany.mockResolvedValue([]);
  sessionFindFirst.mockResolvedValue(null);
  sessionFindUnique.mockResolvedValue(null);
  sessionCreateMany.mockResolvedValue({ count: 7 });
  sessionUpdate.mockResolvedValue({});
  sessionUpdateMany.mockResolvedValue({ count: 1 });
  sessionDeleteMany.mockResolvedValue({ count: 0 });
});

describe("authorization", () => {
  it("no token → UNAUTHORIZED on every procedure", async () => {
    const anon = appRouter.createCaller(ctx(null)).fitness;
    await expect(anon.week({ date: DATE })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.toggleExercise({ date: DATE, slug: "squat", done: true })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(anon.complete({ date: DATE, feedback: "JUST_RIGHT" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(anon.regenerate({ date: DATE })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a malformed date before touching the database", async () => {
    await expect(caller().week({ date: "09-09-2026" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(goalFindFirst).not.toHaveBeenCalled();
  });

  it("scopes every read and write to the caller", async () => {
    await caller("mine").week({ date: DATE });
    expect(goalFindFirst.mock.calls[0]?.[0]?.where).toEqual({ userId: "mine" });
    expect(sessionFindMany.mock.calls[0]?.[0]?.where?.userId).toBe("mine");
  });
});

describe("week", () => {
  /**
   * The brief's empty state is "Set a goal and I'll build your week". Inventing
   * a default week would put words in the user's mouth about what they want.
   */
  it("builds nothing when the user has no goal", async () => {
    goalFindFirst.mockResolvedValue(null);
    const res = await caller().week({ date: DATE });
    expect(res.planned).toBe(false);
    expect(res.sessions).toEqual([]);
    expect(sessionCreateMany).not.toHaveBeenCalled();
  });

  it("generates seven days for the Monday-based week containing the date", async () => {
    await caller().week({ date: DATE });
    const rows = sessionCreateMany.mock.calls[0]?.[0]?.data as { date: Date }[];
    expect(rows).toHaveLength(7);
    // 2026-09-09 is a Wednesday; the week starts Monday the 7th.
    expect(rows[0]?.date.toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(rows[6]?.date.toISOString().slice(0, 10)).toBe("2026-09-13");
  });

  // The core promise: generation fills gaps, it never overwrites.
  it("writes with skipDuplicates, so an existing day is never clobbered", async () => {
    await caller().week({ date: DATE });
    expect(sessionCreateMany.mock.calls[0]?.[0]?.skipDuplicates).toBe(true);
  });

  it("does not generate at all when the week is already complete", async () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 7 + i)),
      title: "Push",
      items: [],
      intensity: 50,
      rationale: "x",
      rest: false,
      completedAt: null,
      feedback: null,
    }));
    sessionFindMany.mockResolvedValue(days);
    await caller().week({ date: DATE });
    expect(sessionCreateMany).not.toHaveBeenCalled();
  });

  it("freezes the readiness it planned against onto every row", async () => {
    snapshotFindUnique.mockResolvedValue({ score: 41 });
    await caller().week({ date: DATE });
    const rows = sessionCreateMany.mock.calls[0]?.[0]?.data as { readiness: number | null }[];
    expect(rows.every((r) => r.readiness === 41)).toBe(true);
  });

  it("plans a rest week when readiness is low, rather than a lighter one", async () => {
    snapshotFindUnique.mockResolvedValue({ score: 20 });
    await caller().week({ date: DATE });
    const rows = sessionCreateMany.mock.calls[0]?.[0]?.data as { rest: boolean; items: unknown[] }[];
    expect(rows.every((r) => r.rest)).toBe(true);
    expect(rows.every((r) => (r.items as unknown[]).length === 0)).toBe(true);
  });

  it("carries the user's last rating into a newly generated week", async () => {
    sessionFindFirst.mockResolvedValue({ feedback: "TOO_HARD" });
    await caller().week({ date: DATE });
    expect(sessionFindFirst.mock.calls[0]?.[0]?.where).toMatchObject({
      userId: USER,
      feedback: { not: null },
    });
  });
});

describe("toggleExercise", () => {
  it("is NOT_FOUND for a day that isn't planned", async () => {
    sessionFindUnique.mockResolvedValue(null);
    await expect(
      caller().toggleExercise({ date: DATE, slug: "squat", done: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an exercise that isn't in this session", async () => {
    sessionFindUnique.mockResolvedValue({
      id: "s1",
      items: [{ slug: "squat", name: "Squat", sets: 3, reps: 10, target: "", done: false }],
    });
    await expect(
      caller().toggleExercise({ date: DATE, slug: "bench", done: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it("ticks exactly one exercise and leaves the rest alone", async () => {
    sessionFindUnique.mockResolvedValue({
      id: "s1",
      items: [
        { slug: "squat", name: "Squat", sets: 3, reps: 10, target: "", done: false },
        { slug: "plank", name: "Plank", sets: 3, reps: 40, target: "", done: false },
      ],
    });
    const res = await caller().toggleExercise({ date: DATE, slug: "squat", done: true });
    expect(res.items.find((i) => i.slug === "squat")?.done).toBe(true);
    expect(res.items.find((i) => i.slug === "plank")?.done).toBe(false);
  });

  it("looks the session up by owner AND date, never by date alone", async () => {
    sessionFindUnique.mockResolvedValue({ id: "s1", items: [] });
    await caller()
      .toggleExercise({ date: DATE, slug: "squat", done: true })
      .catch(() => {});
    expect(sessionFindUnique.mock.calls[0]?.[0]?.where?.userId_date?.userId).toBe(USER);
  });
});

describe("complete", () => {
  it("records the rating against the caller's own session", async () => {
    await caller().complete({ date: DATE, feedback: "TOO_EASY" });
    const call = sessionUpdateMany.mock.calls[0]?.[0];
    expect(call.where.userId).toBe(USER);
    expect(call.data.feedback).toBe("TOO_EASY");
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });

  it("is NOT_FOUND when nothing matched", async () => {
    sessionUpdateMany.mockResolvedValue({ count: 0 });
    await expect(caller().complete({ date: DATE, feedback: "JUST_RIGHT" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects a rating that isn't one of the three", async () => {
    // @ts-expect-error deliberately invalid
    await expect(caller().complete({ date: DATE, feedback: "AWFUL" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("regenerate", () => {
  /**
   * The whole point. A session someone completed, rated, or partly ticked is a
   * record of what they did — a new plan must not delete it.
   */
  it("only considers days with no completion and no rating", async () => {
    sessionFindMany.mockResolvedValue([]);
    await caller().regenerate({ date: DATE });
    expect(sessionFindMany.mock.calls[0]?.[0]?.where).toMatchObject({
      userId: USER,
      completedAt: null,
      feedback: null,
    });
  });

  it("keeps a session that has anything ticked off", async () => {
    sessionFindMany.mockResolvedValue([
      { id: "keep", items: [{ slug: "squat", name: "Squat", done: true }] },
      { id: "drop", items: [{ slug: "plank", name: "Plank", done: false }] },
    ]);
    const res = await caller().regenerate({ date: DATE });
    expect(res.rebuilt).toBe(1);
    expect(sessionDeleteMany.mock.calls[0]?.[0]?.where?.id?.in).toEqual(["drop"]);
  });

  it("deletes nothing when every day has been touched", async () => {
    sessionFindMany.mockResolvedValue([
      { id: "a", items: [{ slug: "squat", name: "Squat", done: true }] },
    ]);
    const res = await caller().regenerate({ date: DATE });
    expect(res.rebuilt).toBe(0);
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });
});
