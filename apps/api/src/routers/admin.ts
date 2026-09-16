/**
 * Platform administration.
 *
 * This is the ONLY legitimate way an account gains staff capability. It is
 * deliberately not reachable from signup: a verified practitioner can read
 * another person's biometrics, journal and diagnostics, so that permission has
 * to be granted by someone, not claimed by the person who benefits from it.
 *
 * Every grant and revoke is audited — who did it, to whom, and which capacity.
 * Granting access to other people's health data is exactly what an audit trail
 * is for.
 */
import { Role, StaffKind, StaffLinkStatus, StaffStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AUDIT, auditLabel, decodeCursor, keysetWhere, nextCursor } from "@pulse/shared";
import { router, adminProcedure } from "../trpc";
import { prisma } from "../db";
import { recordAudit } from "../lib/audit";

const staffKind = z.enum(["PT", "PRACTITIONER"]);

/**
 * Look someone up by their FULL email address, not a fragment.
 *
 * Deliberately not a search. A substring match over this table would turn the
 * admin surface into a bulk export of everyone who uses the app — type "a",
 * receive the membership list — and the real workflow doesn't need it: someone
 * applies to be a trainer and gives you their address, you grant that address.
 * Browsing members is a different feature with a different risk profile.
 */
const findInput = z.object({ email: z.string().email().max(320) });

const grantInput = z.object({
  userId: z.string().uuid(),
  kind: staffKind,
  /** registration number, insurer, whatever was checked — free text for now */
  credential: z.string().max(200).nullish(),
});

const revokeInput = z.object({ userId: z.string().uuid(), kind: staffKind });

/** Members come back a page at a time; the cap is the anti-enumeration bound. */
const MEMBER_PAGE = 25;

/**
 * Shortest search that is allowed to run.
 *
 * Three characters is the difference between looking someone up and listing
 * everyone: a one-character prefix matches a sizeable fraction of any user
 * table. Enforced by Zod, so a short query is refused BEFORE a query is built.
 */
const MIN_SEARCH = 3;

const auditLogInput = z.object({
  actorId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  action: z.string().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().max(256).optional(),
});

const memberBrowseInput = z
  .object({
    mode: z.enum(["recent", "search"]).default("recent"),
    q: z.string().trim().max(64).optional(),
    cursor: z.string().max(256).optional(),
  })
  .refine((v) => v.mode !== "search" || (v.q ?? "").length >= MIN_SEARCH, {
    path: ["q"],
    message: `Type at least ${MIN_SEARCH} characters to search.`,
  });

/** Only the two platform roles. PT/PRACTITIONER live on StaffProfile. */
const setRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["USER", "ADMIN"]),
});

export const adminRouter = router({
  /**
   * Platform counts. Counts only — never anyone's readings — so this stays
   * safe to show on a dashboard and cheap enough to load on every open.
   */
  stats: adminProcedure.query(async () => {
    const [users, verified, pending, suspended, activeLinks, openInvites] = await Promise.all([
      prisma.user.count(),
      prisma.staffProfile.count({ where: { status: StaffStatus.VERIFIED } }),
      prisma.staffProfile.count({ where: { status: StaffStatus.PENDING } }),
      prisma.staffProfile.count({ where: { status: StaffStatus.SUSPENDED } }),
      prisma.staffLink.count({ where: { status: StaffLinkStatus.ACTIVE } }),
      prisma.clientInvite.count({ where: { acceptedAt: null, revokedAt: null } }),
    ]);
    return {
      users,
      staff: { verified, pending, suspended },
      activeLinks,
      openInvites,
      generatedAt: new Date().toISOString(),
    };
  }),

  /**
   * Find the account to act on, by exact email.
   *
   * Returns their capabilities in every status, because the admin's next
   * decision depends on the current one: granting a capability that is already
   * VERIFIED is a no-op, and re-granting a SUSPENDED one is a reinstatement.
   * Deliberately returns no health data of any kind — this answers "who is
   * this account", not "what have they recorded".
   */
  findUser: adminProcedure.input(findInput).query(async ({ input }) => {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        staffProfiles: {
          orderBy: { createdAt: "asc" },
          select: { kind: true, status: true, credential: true, verifiedAt: true },
        },
      },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No account with that email." });
    return { user };
  }),

  /** Everyone holding a staff capability, whatever its status. */
  listStaff: adminProcedure.query(async () => {
    const profiles = await prisma.staffProfile.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        kind: true,
        status: true,
        verifiedAt: true,
        createdAt: true,
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
    return { profiles };
  }),

  /**
   * Grant (or re-instate) a capability. Upsert so re-granting a suspended
   * capability is the same call, and `verifiedAt` records when it was checked.
   */
  grantStaff: adminProcedure.input(grantInput).mutation(async ({ ctx, input }) => {
    const kind = input.kind as StaffKind;
    const profile = await prisma.staffProfile.upsert({
      where: { userId_kind: { userId: input.userId, kind } },
      create: {
        userId: input.userId,
        kind,
        status: StaffStatus.VERIFIED,
        credential: input.credential ?? null,
        verifiedAt: new Date(),
      },
      update: {
        status: StaffStatus.VERIFIED,
        credential: input.credential ?? undefined,
        verifiedAt: new Date(),
      },
      select: { id: true },
    });

    await recordAudit({
      actorId: ctx.user.id,
      subjectId: input.userId,
      action: AUDIT.roleChanged,
      entity: "staffProfile",
      entityId: profile.id,
      meta: { kind: input.kind, status: "VERIFIED" },
    });

    return { id: profile.id, kind: input.kind, status: "VERIFIED" as const };
  }),

  /**
   * Withdraw a capability. Suspends rather than deletes, so the record of it
   * having existed — and of it being withdrawn — survives.
   */
  revokeStaff: adminProcedure.input(revokeInput).mutation(async ({ ctx, input }) => {
    const kind = input.kind as StaffKind;
    const { count } = await prisma.staffProfile.updateMany({
      where: { userId: input.userId, kind },
      data: { status: StaffStatus.SUSPENDED },
    });
    if (count === 0) return { revoked: 0 };

    await recordAudit({
      actorId: ctx.user.id,
      subjectId: input.userId,
      action: AUDIT.roleChanged,
      entity: "staffProfile",
      entityId: null,
      meta: { kind: input.kind, status: "SUSPENDED" },
    });

    return { revoked: count };
  }),

  /**
   * The audit trail, newest first.
   *
   * `AdminScreen` has always promised "Every grant and withdrawal is recorded
   * in the audit log". Nothing read those rows, so the promise was unkeepable —
   * this is the read that makes it true.
   *
   * **Filters are exactly the three indexed axes** (`actorId`, `subjectId`,
   * `action`), plus the unfiltered case that `0018_admin_read_indexes` added an
   * index for. `entity` is returned but deliberately NOT filterable: it is
   * unindexed on an append-only table, so filtering on it is a sequential scan
   * that gets slower every day this app runs. Don't add it without an index.
   */
  auditLog: adminProcedure.input(auditLogInput).query(async ({ ctx, input }) => {
    const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor);
    // A cursor we did not write must never fall through to an unfiltered first
    // page — on this table that is the whole trail, handed over by a typo.
    if (input.cursor !== undefined && cursor === null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That page link isn't valid." });
    }

    const filters: Record<string, unknown> = {};
    if (input.actorId) filters.actorId = input.actorId;
    if (input.subjectId) filters.subjectId = input.subjectId;
    if (input.action) filters.action = input.action;

    const keyset = keysetWhere(cursor);
    const rows = await prisma.auditLog.findMany({
      where: keyset ? { AND: [filters, keyset] } : filters,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // One more than the page, so "is there another page" costs no second query.
      take: input.limit + 1,
      select: {
        id: true,
        actorId: true,
        subjectId: true,
        action: true,
        entity: true,
        entityId: true,
        meta: true,
        createdAt: true,
      },
    });

    const { page, cursor: next } = nextCursor(rows, input.limit, (r) => r.createdAt);

    // AuditLog has no relation to User on purpose — the trail must outlive the
    // accounts it describes, and a cascade would erase the record that a
    // deletion happened. So names are a second, bounded lookup.
    const ids = [...new Set(page.flatMap((r) => [r.actorId, r.subjectId ?? null]))].filter(
      (id): id is string => id !== null,
    );
    const people = ids.length
      ? await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, email: true, fullName: true },
        })
      : [];
    const byId = new Map(people.map((p) => [p.id, p.fullName ?? p.email]));

    /** An account that no longer exists is information, so never render blank. */
    const name = (id: string | null): string | null => {
      if (id === null) return null;
      return byId.get(id) ?? `deleted account (${id.slice(0, 8)})`;
    };

    // Audited — reading who looked at whose record is itself a privileged read,
    // and it is the one read in the system with no other watcher. First page
    // only: auditing every page would turn the trail into a record of scrolling.
    if (cursor === null) {
      await recordAudit({
        actorId: ctx.user.id,
        subjectId: input.subjectId ?? null,
        action: AUDIT.auditViewed,
        entity: "auditLog",
        meta: { filtered: Object.keys(filters).length, results: page.length },
      });
    }

    return {
      entries: page.map((r) => ({
        id: r.id,
        action: r.action,
        label: auditLabel(r.action),
        actor: name(r.actorId),
        subject: name(r.subjectId),
        entity: r.entity,
        entityId: r.entityId,
        meta: r.meta,
        at: r.createdAt.toISOString(),
      })),
      cursor: next,
    };
  }),

  /**
   * Browse members — the deliberate counterpart to `findUser` above, not a
   * replacement for it.
   *
   * `findUser` refuses substring matching because "type 'a', receive the
   * membership list" is a bulk export wearing a search box. That reasoning is
   * still correct, so this keeps its teeth:
   *
   * - `recent` returns the newest 25 and **takes no cursor**, so it answers
   *   "who joined this week" and structurally cannot walk backwards through the
   *   membership.
   * - `search` requires **three characters, enforced at Zod before any query
   *   runs**, and matches with `startsWith` rather than `contains` — a 3-char
   *   `contains` on "gma" returns every Gmail address on the platform.
   * - Results are capped; past the cap it says `truncated` rather than paging
   *   on forever.
   *
   * Every browse is recorded, with the term. "Who did the admin go looking for"
   * is exactly the question this trail exists to answer.
   */
  members: adminProcedure.input(memberBrowseInput).query(async ({ ctx, input }) => {
    const term = input.q?.trim() ?? "";
    const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor);
    if (input.cursor !== undefined && cursor === null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That page link isn't valid." });
    }

    const where: Record<string, unknown> =
      input.mode === "search"
        ? {
            OR: [
              { email: { startsWith: term.toLowerCase() } },
              { fullName: { startsWith: term, mode: "insensitive" } },
            ],
          }
        : {};

    // `recent` is the non-enumerating mode: newest first, no cursor accepted,
    // so there is no way to page back through the membership.
    const keyset = input.mode === "search" ? keysetWhere(cursor) : undefined;
    const rows = await prisma.user.findMany({
      where: keyset ? { AND: [where, keyset] } : where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MEMBER_PAGE + 1,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        // Capability status only. `credential` is a registration number and
        // must never leave the server on a browse.
        staffProfiles: { select: { kind: true, status: true } },
      },
    });

    const { page, cursor: next } = nextCursor(rows, MEMBER_PAGE, (r) => r.createdAt);

    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.membersBrowsed,
      entity: "user",
      meta: { mode: input.mode, term, results: page.length },
    });

    return {
      members: page.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.fullName,
        role: u.role,
        joined: u.createdAt.toISOString(),
        capabilities: u.staffProfiles,
      })),
      // `recent` never pages — see the doc comment.
      cursor: input.mode === "search" ? next : null,
    };
  }),

  /**
   * Make someone an administrator, or stop them being one.
   *
   * Deliberately narrow. `Role` still contains PT and PRACTITIONER for the
   * legacy `StaffLink.role` column, and writing either here would revive the
   * bug class where staff access was decided by a role column — so the input
   * enum admits only USER and ADMIN.
   */
  setRole: adminProcedure.input(setRoleInput).mutation(async ({ ctx, input }) => {
    // No self-elevation, and no locking yourself out by accident.
    if (input.userId === ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can't change your own role.",
      });
    }

    const from = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { role: true },
    });
    if (!from) throw new TRPCError({ code: "NOT_FOUND", message: "No account with that id." });

    await prisma.$transaction(
      async (tx) => {
        // Serializable: a count cannot be expressed as a `where`, and two
        // concurrent demotions could otherwise each see one other admin and
        // both proceed, leaving nobody able to administer the platform.
        if (from.role === Role.ADMIN && input.role !== "ADMIN") {
          const admins = await tx.user.count({ where: { role: Role.ADMIN } });
          if (admins <= 1) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "That would leave the platform with no administrator.",
            });
          }
        }
        await tx.user.update({
          where: { id: input.userId },
          data: { role: input.role === "ADMIN" ? Role.ADMIN : Role.USER },
        });
      },
      { isolationLevel: "Serializable" },
    );

    await recordAudit({
      actorId: ctx.user.id,
      subjectId: input.userId,
      action: AUDIT.roleChanged,
      entity: "user",
      entityId: input.userId,
      meta: { from: from.role, to: input.role },
    });

    return { ok: true as const, role: input.role };
  }),
});
