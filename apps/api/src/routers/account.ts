/**
 * Account procedures.
 *
 * `deleteAccount` is the user-initiated account-deletion flow required by the
 * App Store and Play Store. It:
 *
 * 1. Deletes every row owned by the caller from the application database.
 * 2. Deletes the Supabase auth user via the Admin API (service role key).
 *
 * Both halves are best-effort: if the DB delete succeeds but the Supabase call
 * fails, the user is still logged out and their data is gone; the orphaned
 * auth user is harmless. If the Supabase call succeeds but the DB delete
 * fails, the user is signed out and their auth account is gone; the DB rows
 * are unreachable because the foreign keys point to a non-existent user.
 */

import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";
import { env } from "../env";

export const accountRouter = router({
  /**
   * Permanently delete the caller's account and all associated data.
   *
   * Requires authentication — the caller can only delete their own account.
   * The `ownerProcedure` middleware resolves `ctx.user.id` from the verified
   * JWT, so the client cannot spoof another user's ID.
   */
  deleteAccount: ownerProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Best-effort cascade: delete every row that references this user.
    // Order doesn't matter for `deleteMany`, but we group by entity for
    // readability and to make it obvious what's being removed.
    await Promise.all([
      // Audit trail — includes both the actor and the subject.
      prisma.auditLog.deleteMany({
        where: { OR: [{ actorId: userId }, { subjectId: userId }, { entityId: userId }] },
      }),
      // Session notes written BY this user (as trainer) or ABOUT this user (as client).
      prisma.sessionNote.deleteMany({
        where: { OR: [{ trainerId: userId }, { clientId: userId }] },
      }),
      // Training plans authored BY this user or assigned TO this user.
      prisma.trainingPlan.deleteMany({
        where: { OR: [{ trainerId: userId }, { clientId: userId }] },
      }),
      // Invites sent BY this user or redeemed BY this user.
      prisma.clientInvite.deleteMany({
        where: { OR: [{ staffId: userId }, { acceptedBy: userId }] },
      }),
      // Staff links where this user is the staff member OR the client.
      prisma.staffLink.deleteMany({
        where: { OR: [{ staffId: userId }, { clientId: userId }] },
      }),
      // Staff profiles claimed by this user.
      prisma.staffProfile.deleteMany({ where: { userId } }),
      // Consents set by this user.
      prisma.consent.deleteMany({ where: { userId } }),
      // Goals set by this user.
      prisma.goal.deleteMany({ where: { userId } }),
      // Supplement logs by this user.
      prisma.supplementLog.deleteMany({ where: { userId } }),
      // Supplements owned by this user.
      prisma.supplement.deleteMany({ where: { userId } }),
      // Meals logged by this user.
      prisma.meal.deleteMany({ where: { userId } }),
      // Point metrics recorded by this user.
      prisma.metric.deleteMany({ where: { userId } }),
      // Readiness snapshots for this user.
      prisma.readinessSnapshot.deleteMany({ where: { userId } }),
      // Daily check-ins by this user.
      prisma.dailyLog.deleteMany({ where: { userId } }),
    ]);

    // Delete the user record itself.
    await prisma.user.delete({ where: { id: userId } });

    // Best-effort: also remove the Supabase auth user so the email can be
    // re-used and the auth users table doesn't accumulate orphans.
    if (env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const response = await fetch(
          `${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`,
          {
            method: "DELETE",
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
          },
        );
        if (!response.ok) {
          const text = await response.text();
          console.error(`[account] Supabase admin delete failed: ${response.status} ${text}`);
        }
      } catch (error) {
        console.error("[account] Supabase admin delete error:", error);
      }
    }

    return { ok: true };
  }),
});
