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
