/**
 * tRPC initialization + authorization middleware.
 *  - protectedProcedure → UNAUTHORIZED unless a user is present.
 *  - requireRole(role) / adminProcedure → FORBIDDEN on role mismatch.
 * Authorization lives here in middleware, never in resolvers.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import { Role } from "@prisma/client";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // Narrow ctx.user to non-null for downstream procedures.
  return next({ ctx: { user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);

export function requireRole(role: Role) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== role) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next();
  });
}

export const adminProcedure = requireRole(Role.ADMIN);

/**
 * "This is my own data" — any authenticated account, whatever its role.
 *
 * Consumer features (check-ins, metrics, nutrition, supplements, coach, consent)
 * all scope strictly to `ctx.user.id`, so the role is irrelevant: a trainer or
 * an admin has a body too, and gating these on `requireRole(USER)` made roles
 * mutually exclusive — becoming a PT silently locked you out of your own app.
 * Staff surfaces still require their own role check; this only ever exposes the
 * caller's own records.
 */
export const ownerProcedure = protectedProcedure;

/**
 * Someone with a VERIFIED staff capability (PT or practitioner).
 *
 * Capability, not `User.role`: a capability is granted and can be suspended,
 * one person may hold several, and holding one must not cost them their own
 * consumer app. ADMIN is deliberately NOT staff — running the platform is not
 * the same as being someone's care provider.
 *
 * This only opens the surface. Every client read still needs an ACTIVE link
 * (`lib/staffLink.ts`) AND the client's consent (`staffVisibleCategories`).
 */
export const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.staff.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

/**
 * A VERIFIED personal trainer, specifically.
 *
 * Narrower than `staffProcedure`: a practitioner is not a coach, and an ADMIN
 * is deliberately not staff at all. A class is created by the person who will
 * teach it — if a gym manager needs to schedule one, they are granted PT
 * through the flow that already exists, which is the correct shape rather than
 * a special case here.
 */
export const coachProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.staff.some((s) => s.kind === "PT")) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});
