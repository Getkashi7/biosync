/**
 * Root tRPC router. Resolvers here are intentionally DB-light so authorization
 * can be tested without a database. External input is validated with Zod.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./trpc";
import { logsRouter } from "./routers/logs";
import { metricsRouter } from "./routers/metrics";
import { readinessRouter } from "./routers/readiness";
import { goalsRouter } from "./routers/goals";
import { insightsRouter } from "./routers/insights";
import { assistantRouter } from "./routers/assistant";
import { nutritionRouter } from "./routers/nutrition";
import { supplementsRouter } from "./routers/supplements";
import { consentRouter } from "./routers/consent";
import { staffRouter } from "./routers/staff";
import { trainingRouter } from "./routers/training";
import { adminRouter } from "./routers/admin";
import { invitesRouter } from "./routers/invites";
import { accountRouter } from "./routers/account";
import { notificationsRouter } from "./routers/notifications";
import { photosRouter } from "./routers/photos";
import { treatmentsRouter } from "./routers/treatments";

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

  /** Nutrition — AI macro estimates, the meal log, and a day's ring totals. */
  nutrition: nutritionRouter,

  /** Supplements — the user's own stack + the day's dose strip. Informational only. */
  supplements: supplementsRouter,

  /** Consent — who sees what. Nothing is shared until the user says so. */
  consent: consentRouter,

  /** Staff (PT / practitioner) client access — gated by link AND consent. */
  staff: staffRouter,

  /** Training plans + session notes — trainer writes, client reads what's shared. */
  training: trainingRouter,

  /** Platform administration — granting staff capability, and nothing else yet. */
  admin: adminRouter,

  /** Client invitations — how a client and a staff member get connected. */
  invites: invitesRouter,

  /** Account actions — currently only `deleteAccount`. */
  account: accountRouter,

  /** Notification settings — the device schedules; the server remembers. */
  notifications: notificationsRouter,

  /** Progress photos — private by default; the bucket is never public. */
  photos: photosRouter,

  /** IV therapy & treatments — suggestions are computed, approval is a practitioner act. */
  treatments: treatmentsRouter,
});

export type AppRouter = typeof appRouter;
