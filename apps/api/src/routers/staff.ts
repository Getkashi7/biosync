/**
 * Staff — a trainer's or practitioner's view of their clients.
 *
 * Access needs BOTH halves, checked on every read:
 *   1. an ACTIVE StaffLink between this staff member and the client, and
 *   2. the client's consent, capped by what the role may ever see
 *      (`staffVisibleCategories`).
 *
 * Neither is sufficient alone. A link with no consent returns an empty profile
 * rather than an error, because "connected but sharing nothing" is a normal,
 * legitimate state and the UI should show it plainly.
 *
 * Every client read is audited with the subject's id, so there's a record of
 * which staff member looked at whose record — and, per `sanitiseAuditMeta`,
 * that record never contains the health values themselves.
 */
import { Role, StaffLinkStatus } from "@prisma/client";
import { z } from "zod";
import {
  AUDIT,
  CONSENT_COPY,
  ROLE_CEILING,
  mergeConsents,
  staffVisibleCategories,
  type ConsentRow,
  type StaffRole,
} from "@pulse/shared";
import { router, staffProcedure } from "../trpc";
import { prisma } from "../db";
import { recordAudit } from "../lib/audit";
import { TRPCError } from "@trpc/server";


/** Prisma's Role → the narrower staff role the access rules speak in. */
function asStaffRole(role: Role): StaffRole {
  return role === Role.PT ? "PT" : "PRACTITIONER";
}

export const staffRouter = router({
  /**
   * The caller's active clients, with just enough for the roster: engagement
   * recency and a 7-day check-in strip.
   *
   * That engagement summary is itself consent-gated — a client who hasn't shared
   * ACTIVITY comes back with `activityShared: false` and NO strip, so the UI can
   * say "Not shared" honestly instead of rendering zeros (which would read as
   * "they did nothing"). Never any health values: the strip records only WHETHER
   * a day was checked in, never what was in the check-in.
   */
  clients: staffProcedure.query(async ({ ctx }) => {
    const links = await prisma.staffLink.findMany({
      where: { staffId: ctx.user.id, status: StaffLinkStatus.ACTIVE, role: ctx.user.role },
      orderBy: { createdAt: "asc" },
      select: { clientId: true, createdAt: true, client: { select: { fullName: true, email: true } } },
    });
    if (links.length === 0) return { clients: [] };

    const clientIds = links.map((l) => l.clientId);
    const staffRole = asStaffRole(ctx.user.role);

    // Which of these clients let this role see their activity at all.
    const consents = await prisma.consent.findMany({
      where: { userId: { in: clientIds } },
      select: { userId: true, category: true, audience: true },
    });
    const byClient = new Map<string, ConsentRow[]>();
    for (const c of consents) {
      const rows = byClient.get(c.userId) ?? [];
      rows.push({ category: c.category, audience: c.audience });
      byClient.set(c.userId, rows);
    }
    const sharesActivity = new Set(
      clientIds.filter((id) =>
        staffVisibleCategories(mergeConsents(byClient.get(id) ?? []), staffRole).includes("ACTIVITY"),
      ),
    );

    // Check-in DATES only, for the clients who shared — no values are selected.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const shared = [...sharesActivity];
    const logs = shared.length
      ? await prisma.dailyLog.findMany({
          where: { userId: { in: shared }, date: { gte: since } },
          orderBy: { date: "desc" },
          select: { userId: true, date: true },
        })
      : [];

    const daysByClient = new Map<string, Set<string>>();
    const latestByClient = new Map<string, Date>();
    for (const l of logs) {
      const key = l.date.toISOString().slice(0, 10);
      const set = daysByClient.get(l.userId) ?? new Set<string>();
      set.add(key);
      daysByClient.set(l.userId, set);
      if (!latestByClient.has(l.userId)) latestByClient.set(l.userId, l.date);
    }

    const today = new Date();
    const dayKey = (offset: number): string =>
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset))
        .toISOString()
        .slice(0, 10);

    return {
      clients: links.map((l) => {
        const name = l.client.fullName ?? l.client.email;
        const activityShared = sharesActivity.has(l.clientId);
        const days = daysByClient.get(l.clientId);
        const latest = latestByClient.get(l.clientId);
        return {
          id: l.clientId,
          name,
          since: l.createdAt,
          activityShared,
          /** oldest → newest; true = checked in that day. Empty when not shared. */
          week: activityShared ? [6, 5, 4, 3, 2, 1, 0].map((o) => days?.has(dayKey(o)) ?? false) : [],
          /** whole days since the last check-in, or null when none / not shared */
          lastCheckinDays:
            activityShared && latest
              ? Math.max(0, Math.floor((today.getTime() - latest.getTime()) / (24 * 60 * 60 * 1000)))
              : null,
        };
      }),
    };
  }),

  /**
   * What this staff member may see for one client: the permitted categories and
   * only the data inside them. Requires an active link; unlinked clients are
   * NOT_FOUND rather than FORBIDDEN, so the endpoint can't be used to probe
   * whether a given user exists.
   */
  client: staffProcedure.input(z.object({ clientId: z.string().uuid() })).query(async ({ ctx, input }) => {
    // Wave 1: the authorization gate (the link) and the client's consent, in
    // parallel. Neither is health data, and consent is discarded if there's no
    // link, so fetching them together is safe — and one round-trip, not two.
    const [link, stored] = await Promise.all([
      prisma.staffLink.findFirst({
        where: {
          staffId: ctx.user.id,
          clientId: input.clientId,
          role: ctx.user.role,
          status: StaffLinkStatus.ACTIVE,
        },
        select: { id: true, createdAt: true, client: { select: { fullName: true, email: true } } },
      }),
      prisma.consent.findMany({
        where: { userId: input.clientId },
        select: { category: true, audience: true },
      }),
    ]);
    if (!link) throw new TRPCError({ code: "NOT_FOUND" });

    const visible = staffVisibleCategories(mergeConsents(stored as ConsentRow[]), asStaffRole(ctx.user.role));

    // Wave 2: everything the screen shows, in one parallel batch (previously six
    // sequential round-trips). The consent-gated categories are still only
    // queried when permitted — a category the client hasn't shared is never read
    // from the database at all — and the audit write runs concurrently so it
    // adds durability, not latency.
    const [activity, biometrics, goals, sessions] = await Promise.all([
      visible.includes("ACTIVITY")
        ? prisma.dailyLog.findMany({
            where: { userId: input.clientId },
            orderBy: { date: "desc" },
            take: 14,
            select: { date: true, energy: true },
          })
        : Promise.resolve([]),
      visible.includes("BIOMETRICS")
        ? prisma.readinessSnapshot.findMany({
            where: { userId: input.clientId },
            orderBy: { date: "desc" },
            take: 14,
            select: { date: true, score: true },
          })
        : Promise.resolve([]),
      // Training goals ride with ACTIVITY — what the client trains for, not a
      // health record. Still gated: no consent, no goals.
      visible.includes("ACTIVITY")
        ? prisma.goal.findMany({
            where: { userId: input.clientId },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, description: true },
          })
        : Promise.resolve([]),
      // The trainer's own notes about this client — their words, not gated.
      prisma.sessionNote.findMany({
        where: { trainerId: ctx.user.id, clientId: input.clientId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, body: true, sharedWithClient: true, createdAt: true },
      }),
      recordAudit({
        actorId: ctx.user.id,
        subjectId: input.clientId,
        action: AUDIT.staffViewedClient,
        entity: "client",
        entityId: input.clientId,
        meta: { role: ctx.user.role, categories: visible.length },
      }),
    ]);

    /** Categories this role could see, that this client hasn't shared. */
    const notShared = ROLE_CEILING[asStaffRole(ctx.user.role)]
      .filter((c) => !visible.includes(c))
      .map((c) => CONSENT_COPY[c].name);

    return {
      name: link.client.fullName ?? link.client.email,
      since: link.createdAt,
      visible,
      notShared,
      goals,
      activity,
      biometrics,
      sessions,
    };
  }),
});
