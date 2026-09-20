/**
 * The vitals tiles on a staff member's view of a client.
 *
 * `staff.test.ts` covers who may reach this resolver at all. This covers the
 * one property that matters once they are through: **a category the client has
 * not shared is never queried.** Not filtered afterwards — not read. A filter
 * over a result set is one refactor from being dropped; a query that never runs
 * cannot leak, and on biometrics that distinction is the whole point.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const linkFindFirst = vi.fn();
const consentFindMany = vi.fn();
const metricFindMany = vi.fn();
const dailyLogFindMany = vi.fn();
const readinessFindMany = vi.fn();
const goalFindMany = vi.fn();
const noteFindMany = vi.fn();
const auditCreate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    staffLink: { findFirst: (...a: unknown[]) => linkFindFirst(...a) },
    consent: { findMany: (...a: unknown[]) => consentFindMany(...a) },
    metric: { findMany: (...a: unknown[]) => metricFindMany(...a) },
    dailyLog: { findMany: (...a: unknown[]) => dailyLogFindMany(...a) },
    readinessSnapshot: { findMany: (...a: unknown[]) => readinessFindMany(...a) },
    goal: { findMany: (...a: unknown[]) => goalFindMany(...a) },
    sessionNote: { findMany: (...a: unknown[]) => noteFindMany(...a) },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const PRAC = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";

const prac = () =>
  appRouter.createCaller(ctx({ id: PRAC, role: "USER", staff: ["PRACTITIONER"] })).staff;

const vital = (type: string, value: number, iso: string) => ({
  type,
  value,
  recordedAt: new Date(iso),
});

beforeEach(() => {
  vi.clearAllMocks();
  linkFindFirst.mockResolvedValue({
    id: "l1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    kind: "PRACTITIONER",
    client: { fullName: "Sarah Chen", email: "sarah@example.test" },
  });
  consentFindMany.mockResolvedValue([{ category: "BIOMETRICS", audience: "PRACTITIONER" }]);
  metricFindMany.mockResolvedValue([]);
  dailyLogFindMany.mockResolvedValue([]);
  readinessFindMany.mockResolvedValue([]);
  goalFindMany.mockResolvedValue([]);
  noteFindMany.mockResolvedValue([]);
  auditCreate.mockResolvedValue({});
});

describe("consent gates the read, not the render", () => {
  /**
   * The assertion this file exists for. No BIOMETRICS consent means the metric
   * table is not touched at all.
   */
  it("never queries metrics without the biometrics consent", async () => {
    consentFindMany.mockResolvedValue([{ category: "ACTIVITY", audience: "PRACTITIONER" }]);
    const res = await prac().client({ clientId: CLIENT });
    expect(metricFindMany).not.toHaveBeenCalled();
    expect(res.vitals).toEqual([]);
  });

  /**
   * A consent aimed at a trainer does not open a practitioner's read, and vice
   * versa — the audience has to match the capacity the link was formed in.
   */
  it("never queries metrics when the consent names another audience", async () => {
    consentFindMany.mockResolvedValue([{ category: "BIOMETRICS", audience: "TRAINER" }]);
    await prac().client({ clientId: CLIENT });
    expect(metricFindMany).not.toHaveBeenCalled();
  });

  /**
   * A PT can never see biometrics at all — `ROLE_CEILING` caps them at activity
   * and photos, and no consent the client gives can widen it.
   */
  it("never queries metrics for a trainer, even with the consent given", async () => {
    linkFindFirst.mockResolvedValue({
      id: "l1",
      createdAt: new Date(),
      kind: "PT",
      client: { fullName: "Sarah Chen", email: "sarah@example.test" },
    });
    consentFindMany.mockResolvedValue([{ category: "BIOMETRICS", audience: "TRAINER" }]);
    const res = await appRouter
      .createCaller(ctx({ id: PRAC, role: "USER", staff: ["PT"] }))
      .staff.client({ clientId: CLIENT });
    expect(metricFindMany).not.toHaveBeenCalled();
    expect(res.vitals).toEqual([]);
  });
});

describe("what comes back", () => {
  it("asks only for the two types the screen renders", async () => {
    await prac().client({ clientId: CLIENT });
    const where = (metricFindMany.mock.calls[0]?.[0] as Record<string, unknown>)
      .where as Record<string, unknown>;
    expect(where.userId).toBe(CLIENT);
    expect(where.type).toEqual({ in: ["RESTING_HR", "SLEEP_HOURS"] });
  });

  it("returns the newest reading of each type", async () => {
    metricFindMany.mockResolvedValue([
      vital("RESTING_HR", 54, "2026-09-08T07:00:00.000Z"),
      vital("SLEEP_HOURS", 7.7, "2026-09-08T07:00:00.000Z"),
      vital("RESTING_HR", 61, "2026-09-01T07:00:00.000Z"),
    ]);
    const res = await prac().client({ clientId: CLIENT });
    expect(res.vitals).toHaveLength(2);
    expect(res.vitals.find((v) => v.type === "RESTING_HR")?.value).toBe(54);
    expect(res.vitals.find((v) => v.type === "SLEEP_HOURS")?.value).toBe(7.7);
  });

  /**
   * One tile, not one tile and a dash. A placeholder for a reading that was
   * never taken looks like a missing value rather than an absent habit.
   */
  it("omits a type the client has never logged", async () => {
    metricFindMany.mockResolvedValue([vital("SLEEP_HOURS", 7.7, "2026-09-08T07:00:00.000Z")]);
    const res = await prac().client({ clientId: CLIENT });
    expect(res.vitals.map((v) => v.type)).toEqual(["SLEEP_HOURS"]);
  });
});
