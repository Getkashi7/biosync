/**
 * Goal procedures. Same shape as the other domain routers: authorization in
 * middleware, shared Zod at the boundary, owner always from the session.
 */
import { Role } from "@prisma/client";
import { goalInput } from "@pulse/shared";
import { router, requireRole } from "../trpc";
import { prisma } from "../db";

const userProcedure = requireRole(Role.USER);

export const goalsRouter = router({
  /** Create a goal. */
  set: userProcedure.input(goalInput).mutation(async ({ ctx, input }) => {
    await prisma.goal.create({
      data: {
        userId: ctx.user.id,
        description: input.description,
        targetMetric: input.targetMetric ?? null,
      },
    });
    return { ok: true };
  }),

  /** The user's goals, newest first — the dashboard's Goals section. */
  list: userProcedure.query(async ({ ctx }) => {
    const rows = await prisma.goal.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, description: true, targetMetric: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      description: r.description,
      targetMetric: r.targetMetric,
      createdAt: r.createdAt.toISOString(),
    }));
  }),
});
