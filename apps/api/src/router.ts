/**
 * Root tRPC router. Resolvers here are intentionally DB-light so authorization
 * can be tested without a database. External input is validated with Zod.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./trpc";
import { logsRouter } from "./routers/logs";
import { metricsRouter } from "./routers/metrics";
import { readinessRouter } from "./routers/readiness";
import { goalsRouter } from "./routers/goals";
import { insightsRouter } from "./routers/insights";
import { assistantRouter } from "./routers/assistant";

export const appRouter = router({
  /** Liveness check — no auth. */
  health: publicProcedure.query(() => ({ ok: true })),

  /** Current user's id + role. Requires a valid session. */
  me: protectedProcedure.query(({ ctx }) => ctx.user),

  /** Example of Zod-validated input on a protected procedure. */
  greet: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ input }) => ({ message: `Hello, ${input.name}.` })),

  /** Daily check-in + streak. */
  logs: logsRouter,

  /** Point metrics — log a reading, read a range. */
  metrics: metricsRouter,

  /** Daily readiness score. */
  readiness: readinessRouter,

  /** User goals. */
  goals: goalsRouter,

  /** Read-only insight feed. */
  insights: insightsRouter,

  /** AI Coach — conversational wellness guide grounded in the user's data. */
  assistant: assistantRouter,

  admin: router({
    /** Admin-only — throws FORBIDDEN for non-admins. */
    stats: adminProcedure.query(() => ({ users: 0, generatedAt: new Date().toISOString() })),
  }),
});

export type AppRouter = typeof appRouter;
