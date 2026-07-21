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

/** The roles that can act on a client's behalf. ADMIN is not a care provider. */
const STAFF_ROLES: Role[] = [Role.PT, Role.PRACTITIONER];

/**
 * A staff member (PT or practitioner). Being staff only opens the surface —
 * every client read still needs an ACTIVE link and the client's consent.
 */
export const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!STAFF_ROLES.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});
