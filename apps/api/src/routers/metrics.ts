/**
 * Metric procedures. Authorization is enforced by `requireRole(USER)` in
 * middleware; resolvers stay thin. Input is validated with the shared Zod
 * schema so the mobile client infers identical types end-to-end.
 */

import { metricLogInput, metricRangeInput, metricListInput } from "@pulse/shared";
import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";

const userProcedure = ownerProcedure;

export const metricsRouter = router({
  /** Record one reading. The row's owner is the session user — never the input. */
  log: userProcedure.input(metricLogInput).mutation(async ({ ctx, input }) => {
    await prisma.metric.create({
      data: {
        userId: ctx.user.id,
        type: input.type,
        value: input.value,
        source: input.source ?? "MANUAL",
        recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
      },
    });
    return { ok: true };
  }),

  /** One type's readings over a window, oldest first — powers the trend charts. */
  range: userProcedure.input(metricRangeInput).query(async ({ ctx, input }) => {
    const rows = await prisma.metric.findMany({
      where: {
        userId: ctx.user.id,
        type: input.type,
        recordedAt: { gte: new Date(input.from), lte: new Date(input.to) },
      },
      orderBy: { recordedAt: "asc" },
      select: { value: true, recordedAt: true, source: true },
    });
    // Dates cross the wire as ISO strings so the client infers a plain string.
    return rows.map((r) => ({
      value: r.value,
      source: r.source,
      recordedAt: r.recordedAt.toISOString(),
    }));
  }),

  /** Every type's readings in the window, newest first — the journal feed. */
  list: userProcedure.input(metricListInput).query(async ({ ctx, input }) => {
    const rows = await prisma.metric.findMany({
      where: {
        userId: ctx.user.id,
        recordedAt: { gte: new Date(input.from), lte: new Date(input.to) },
      },
      orderBy: { recordedAt: "desc" },
      select: { type: true, value: true, source: true, recordedAt: true },
    });
    return rows.map((r) => ({
      type: r.type,
      value: r.value,
      source: r.source,
      recordedAt: r.recordedAt.toISOString(),
    }));
  }),
});
