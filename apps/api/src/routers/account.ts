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

import { ACCESS_ACTIONS, ACCESS_LABELS, ACCESS_RECORD_LIMIT, parsePlanItems } from "@pulse/shared";
import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";
import { env } from "../env";
import { createSignedReadUrl, deleteAllUserObjects } from "../lib/storage";

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

    // Stored images FIRST, before the rows that point at them. Photo rows go
    // when the user row cascades, but the files would otherwise stay in the
    // bucket with nothing left to reference them — unreachable, still stored,
    // and a direct contradiction of what the delete dialog promises. Erasure
    // has to reach the bytes.
    //
    // Best-effort: a storage hiccup must not block the account deletion the
    // user asked for. A shortfall is logged as a count, never as paths — a
    // path contains the user's id.
    const purge = await deleteAllUserObjects(userId);
    if (purge.failed > 0) {
      console.error(`[account] ${purge.failed} stored object(s) could not be deleted`);
    }

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

  /**
   * Everything this account holds, as one JSON document.
   *
   * The legal counterpart to `deleteAccount`: under UK GDPR the right to
   * erasure and the right to portability travel together, so shipping one
   * without the other leaves a real gap. Deliberately the mirror of the
   * deletion cascade above — if a table is worth deleting on the way out, it
   * is worth handing over first. When one changes, change the other.
   *
   * Photos are exported as metadata plus a short-lived signed URL rather than
   * inlined bytes: a gallery of base64 images would be tens of megabytes in a
   * single JSON response. The export says plainly that those links expire.
   */
  exportData: ownerProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const [
      user, dailyLogs, metrics, readiness, meals, supplements, supplementLogs,
      goals, consents, photos, notificationPrefs, notificationNudges,
      staffProfiles, staffLinks, invites, plans, notes,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, fullName: true, role: true, createdAt: true },
      }),
      prisma.dailyLog.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.metric.findMany({ where: { userId }, orderBy: { recordedAt: "desc" } }),
      prisma.readinessSnapshot.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.meal.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.supplement.findMany({ where: { userId } }),
      prisma.supplementLog.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.goal.findMany({ where: { userId } }),
      prisma.consent.findMany({ where: { userId } }),
      prisma.photo.findMany({ where: { userId }, orderBy: { takenOn: "desc" } }),
      prisma.notificationPrefs.findUnique({ where: { userId } }),
      prisma.notificationNudge.findMany({ where: { userId } }),
      prisma.staffProfile.findMany({ where: { userId } }),
      prisma.staffLink.findMany({ where: { OR: [{ clientId: userId }, { staffId: userId }] } }),
      // codeHash is deliberately not selected: it's a credential digest, and
      // exporting it serves no portability purpose.
      prisma.clientInvite.findMany({
        where: { OR: [{ staffId: userId }, { acceptedBy: userId }] },
        select: {
          id: true, staffId: true, kind: true, email: true, expiresAt: true,
          acceptedAt: true, acceptedBy: true, revokedAt: true, createdAt: true,
        },
      }),
      prisma.trainingPlan.findMany({ where: { OR: [{ clientId: userId }, { trainerId: userId }] } }),
      prisma.sessionNote.findMany({ where: { OR: [{ clientId: userId }, { trainerId: userId }] } }),
    ]);

    const photosWithUrls = await Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        takenOn: p.takenOn.toISOString().slice(0, 10),
        audienceOverride: p.audienceOverride,
        mimeType: p.mimeType,
        byteSize: p.byteSize,
        createdAt: p.createdAt.toISOString(),
        downloadUrl: await createSignedReadUrl(p.storagePath),
      })),
    );

    return {
      exportedAt: new Date().toISOString(),
      format: "biosync.export.v1",
      notes: [
        "This is every record BIOSYNC holds for this account.",
        "Photo download links are temporary and expire a few minutes after this export was made. Re-export to get fresh ones.",
        "Audit entries are omitted: they record who touched what, and include other people's actions on your data.",
      ],
      account: user,
      dailyLogs,
      metrics,
      readinessSnapshots: readiness,
      meals,
      supplements,
      supplementLogs,
      goals,
      consents,
      photos: photosWithUrls,
      notifications: { prefs: notificationPrefs, nudges: notificationNudges },
      staff: { profiles: staffProfiles, links: staffLinks, invites },
      coaching: {
        // `items` is a Json column. Narrowed through the same parser the rest of
        // the app reads it with, for two reasons: an export is a document
        // somebody may still be reading in five years, so emitting whatever
        // happens to be in the column — including a shape a previous version
        // wrote — hands them something they cannot interpret. And Prisma's
        // `JsonValue` is recursive, which blew TypeScript's instantiation limit
        // (TS2589) in the mobile client the moment it tried to derive this
        // procedure's return type.
        trainingPlans: plans.map((pl) => ({ ...pl, items: parsePlanItems(pl.items) })),
        sessionNotes: notes,
      },
    };
  }),

  /**
   * 9F from the client's side — every time a care provider opened this
   * person's records, and who.
   *
   * `subjectId` comes from the session, never input: this is the one list of
   * who has looked at you, and it must not be possible to ask for anyone
   * else's. Rows outlive the link on purpose — disconnecting a trainer does not
   * erase the fact that they looked.
   */
  accessRecord: ownerProcedure.query(async ({ ctx }) => {
    const rows = await prisma.auditLog.findMany({
      where: { subjectId: ctx.user.id, action: { in: [...ACCESS_ACTIONS] } },
      orderBy: { createdAt: "desc" },
      take: ACCESS_RECORD_LIMIT,
      select: { actorId: true, action: true, createdAt: true },
    });
    // The audit table has no foreign key (rows must survive the account that
    // wrote them), so names are resolved separately.
    const actors = await prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } },
      select: { id: true, fullName: true, email: true },
    });
    const nameOf = new Map(actors.map((a) => [a.id, a.fullName ?? a.email]));
    return {
      events: rows.map((r) => ({
        // Named plainly rather than hidden: an account that has since been
        // deleted still looked, and the record should still say so.
        who: nameOf.get(r.actorId) ?? "A former care provider",
        what: ACCESS_LABELS[r.action] ?? r.action,
        at: r.createdAt.toISOString(),
      })),
    };
  }),
});
