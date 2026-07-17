/**
 * Readiness procedures. The DB gathering + scoring live in `../lib/readiness`
 * (shared with the Insights trend), which hands the ingredients to the pure
 * `computeReadiness` in @pulse/shared — so the scoring logic stays testable
 * without a database.
 */
import { Role } from "@prisma/client";
import { readinessInput } from "@pulse/shared";
import { router, requireRole } from "../trpc";
import { computeReadinessForDate } from "../lib/readiness";

const userProcedure = requireRole(Role.USER);

export const readinessRouter = router({
  /** Today's 0–100 score with its component breakdown and confidence flag. */
  today: userProcedure.input(readinessInput).query(async ({ ctx, input }) => {
    return computeReadinessForDate(ctx.user.id, input.today, new Date());
  }),
});
