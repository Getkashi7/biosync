/**
 * Root tRPC router. Resolvers here are intentionally DB-light so authorization
 * can be tested without a database. External input is validated with Zod.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./trpc";
import { logsRouter } from "./routers/logs";

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

  admin: router({
    /** Admin-only — throws FORBIDDEN for non-admins. */
    stats: adminProcedure.query(() => ({ users: 0, generatedAt: new Date().toISOString() })),
  }),
});

export type AppRouter = typeof appRouter;
