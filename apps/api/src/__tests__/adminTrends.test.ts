/**
 * §10 trends — the shape of the window, and what it refuses to draw.
 *
 * Two properties carry the weight here. Every day in the range is present even
 * when nothing happened, because a chart that omits quiet days compresses the
 * gaps and makes a flat month look like steady growth. And hitting the row cap
 * sets `approximate` rather than truncating in silence — someone makes a
 * business decision from this screen.
 *
 * There is also a test for a series that does NOT exist. Stripe gives a
 * snapshot of subscriptions as they are now, not as they were in August, so an
 * MRR sparkline would be invented. That absence is the point, and a test is the
 * only way an absence survives a refactor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const userFindMany = vi.fn();
const staffFindMany = vi.fn();
const bookingFindMany = vi.fn();
const visitFindMany = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    staffProfile: { findMany: (...a: unknown[]) => staffFindMany(...a) },
    classBooking: { findMany: (...a: unknown[]) => bookingFindMany(...a) },
    gymVisit: { findMany: (...a: unknown[]) => visitFindMany(...a) },
  },
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const admin = () => appRouter.createCaller(ctx({ id: ADMIN_ID, role: "ADMIN" })).admin;

/** Mid-January, so Europe/London is on GMT and a local day is a UTC day. */
const NOW = new Date("2026-01-15T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  userFindMany.mockResolvedValue([]);
  staffFindMany.mockResolvedValue([]);
  bookingFindMany.mockResolvedValue([]);
  visitFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("who may read it", () => {
  it("is admin-only", async () => {
    const user = appRouter.createCaller(ctx({ id: "u1", role: "USER" })).admin;
    await expect(user.trends({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    // A verified trainer is not an administrator either.
    const pt = appRouter.createCaller(ctx({ id: "p1", role: "USER", staff: ["PT"] })).admin;
    await expect(pt.trends({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the window", () => {
  it("returns every day, oldest first, including the empty ones", async () => {
    const res = await admin().trends({ days: 7 });
    expect(res.series.signups).toHaveLength(7);
    expect(res.series.signups[0]?.date).toBe("2026-01-09");
    expect(res.series.signups[6]?.date).toBe("2026-01-15");
    expect(res.from).toBe("2026-01-09");
    expect(res.series.signups.every((d) => d.count === 0)).toBe(true);
  });

  it("counts each row into its own day", async () => {
    userFindMany.mockResolvedValue([
      { createdAt: new Date("2026-01-15T09:00:00.000Z") },
      { createdAt: new Date("2026-01-15T23:30:00.000Z") },
      { createdAt: new Date("2026-01-09T00:10:00.000Z") },
    ]);
    const res = await admin().trends({ days: 7 });
    const byDate = Object.fromEntries(res.series.signups.map((d) => [d.date, d.count]));
    expect(byDate["2026-01-15"]).toBe(2);
    expect(byDate["2026-01-09"]).toBe(1);
    expect(byDate["2026-01-12"]).toBe(0);
  });

  // A capability that was granted but never verified has no date to plot.
  it("ignores a staff profile with no verified date", async () => {
    staffFindMany.mockResolvedValue([
      { verifiedAt: new Date("2026-01-14T10:00:00.000Z") },
      { verifiedAt: null },
    ]);
    const res = await admin().trends({ days: 7 });
    const total = res.series.staffVerified.reduce((n, d) => n + d.count, 0);
    expect(total).toBe(1);
  });

  it("does not silently widen the window when asked for a decade", async () => {
    await expect(admin().trends({ days: 3650 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin().trends({ days: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("honesty about the totals", () => {
  /**
   * The cap is reached, so the totals under-count. Saying so is the whole
   * mechanism — a chart quietly missing its busiest week is worse than one
   * labelled incomplete.
   */
  it("marks the answer approximate when a series hits the cap", async () => {
    bookingFindMany.mockResolvedValue(
      Array.from({ length: 5001 }, () => ({ bookedAt: new Date("2026-01-14T10:00:00.000Z") })),
    );
    const res = await admin().trends({ days: 7 });
    expect(res.approximate).toBe(true);
  });

  it("is not approximate when every series fits", async () => {
    userFindMany.mockResolvedValue([{ createdAt: new Date("2026-01-14T10:00:00.000Z") }]);
    const res = await admin().trends({ days: 7 });
    expect(res.approximate).toBe(false);
  });

  /**
   * The series that must not appear. Stripe reports subscriptions as they are
   * now; drawing a line back through August from that would be a fabricated
   * number on a screen someone makes decisions from.
   */
  it("draws no revenue line", async () => {
    const res = await admin().trends({ days: 7 });
    expect(Object.keys(res.series).sort()).toEqual([
      "bookings",
      "signups",
      "staffVerified",
      "visits",
    ]);
  });
});
