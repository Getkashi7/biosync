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
import { MetricType, StaffKind, StaffLinkStatus } from "@prisma/client";
import { z } from "zod";
import {
  ACCESS_ACTIONS,
  ACCESS_LABELS,
  ACCESS_RECORD_LIMIT,
  AUDIT,
  CONSENT_COPY,
  ROLE_CEILING,
  mergeConsents,
  staffVisibleCategories,
  type ConsentRow,
  type StaffRole,
} from "@pulse/shared";
import { router, staffProcedure } from "../trpc";
import { staffKinds } from "../context";
import { prisma } from "../db";
import { recordAudit } from "../lib/audit";
import { assertLinked } from "../lib/staffLink";
import { TRPCError } from "@trpc/server";


/** Prisma's StaffKind → the staff role the access rules speak in. */
type VitalRow = { type: MetricType; value: number; recordedAt: Date };

/**
 * The most recent reading of each type, newest first.
 *
 * Returns only what is actually there: a client who has logged sleep but never
 * a resting heart rate gets one tile, not one tile and a dash. A placeholder
 * for a reading that was never taken looks like a missing value rather than an
 * absent habit.
 */
function latestPerType(rows: readonly VitalRow[]): VitalRow[] {
  const seen = new Map<MetricType, VitalRow>();
  for (const r of rows) if (!seen.has(r.type)) seen.set(r.type, r);
  return [...seen.values()];
}

function asStaffRole(kind: StaffKind): StaffRole {
  return kind === StaffKind.PT ? "PT" : "PRACTITIONER";
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
      where: {
        staffId: ctx.user.id,
        status: StaffLinkStatus.ACTIVE,
        AND: [
          { kind: { not: null } },
          { kind: { in: staffKinds(ctx.user) } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        clientId: true,
        createdAt: true,
        kind: true,
        client: { select: { fullName: true, email: true } },
      },
    });
    if (links.length === 0) return { clients: [] };

    const clientIds = links.map((l) => l.clientId);

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
    // Evaluated per LINK, not once for the caller: someone who holds both
    // capacities sees each client through the capacity that link was formed in,
    // so a PT link never inherits the practitioner's wider ceiling.
    const sharesActivity = new Set(
      links
        .filter((l) =>
          l.kind
            ? staffVisibleCategories(
                mergeConsents(byClient.get(l.clientId) ?? []),
                asStaffRole(l.kind),
              ).includes("ACTIVITY")
            : false,
        )
        .map((l) => l.clientId),
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
          status: StaffLinkStatus.ACTIVE,
          AND: [
            { kind: { not: null } },
            { kind: { in: staffKinds(ctx.user) } },
          ],
        },
        select: {
          id: true,
          createdAt: true,
          kind: true,
          client: { select: { fullName: true, email: true } },
        },
      }),
      prisma.consent.findMany({
        where: { userId: input.clientId },
        select: { category: true, audience: true },
      }),
    ]);
    if (!link?.kind) throw new TRPCError({ code: "NOT_FOUND" });

    // The capacity comes from the LINK, not from whatever else the caller may
    // hold, so a dual-capacity staff member can't read a PT client's health
    // record by virtue of also being a practitioner elsewhere.
    const staffRole = asStaffRole(link.kind);
    const visible = staffVisibleCategories(mergeConsents(stored as ConsentRow[]), staffRole);

    // Wave 2: everything the screen shows, in one parallel batch (previously six
    // sequential round-trips). The consent-gated categories are still only
    // queried when permitted — a category the client hasn't shared is never read
    // from the database at all — and the audit write runs concurrently so it
    // adds durability, not latency.
    const [activity, biometrics, vitals, goals, sessions] = await Promise.all([
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
      /**
       * The two readings the client screen puts on tiles.
       *
       * Gated on BIOMETRICS like the readiness scores above, and never read at
       * all without it — a category the client has not shared is not queried,
       * which is the same discipline the rest of this resolver keeps. Narrowed
       * to the two types actually rendered rather than every metric they own:
       * a staff surface should read what it shows and nothing more.
       */
      visible.includes("BIOMETRICS")
        ? prisma.metric.findMany({
            where: {
              userId: input.clientId,
              type: { in: [MetricType.RESTING_HR, MetricType.SLEEP_HOURS] },
            },
            orderBy: { recordedAt: "desc" },
            take: 40,
            select: { type: true, value: true, recordedAt: true },
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
        meta: { kind: link.kind, categories: visible.length },
      }),
    ]);

    /** Categories this role could see, that this client hasn't shared. */
    const notShared = ROLE_CEILING[staffRole]
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
      // Latest per type. `take: 40` over a desc ordering is enough to hold the
      // most recent of each without a second query per type.
      vitals: latestPerType(vitals),
      sessions,
    };
  }),

  /**
   * 9F — this staff member's own reads of one client, newest first.
   *
   * Scoped to the caller as actor: a practitioner sees what *they* looked at,
   * never a colleague's. The client sees every provider's rows through
   * `account.accessRecord`, which is what makes "Sarah sees the same record"
   * true rather than a line of copy. Gated on an active link like every other
   * client read, so it cannot be used to probe for accounts.
   */
  accessRecord: staffProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertLinked(ctx.user.id, staffKinds(ctx.user), input.clientId);
      const [client, rows] = await Promise.all([
        prisma.user.findUnique({
          where: { id: input.clientId },
          select: { fullName: true, email: true },
        }),
        prisma.auditLog.findMany({
          where: {
            actorId: ctx.user.id,
            subjectId: input.clientId,
            action: { in: [...ACCESS_ACTIONS] },
          },
          orderBy: { createdAt: "desc" },
          take: ACCESS_RECORD_LIMIT,
          select: { action: true, createdAt: true },
        }),
      ]);
      return {
        clientName: client?.fullName ?? client?.email ?? "",
        events: rows.map((r) => ({
          what: ACCESS_LABELS[r.action] ?? r.action,
          at: r.createdAt.toISOString(),
        })),
      };
    }),
});
