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
import { StaffKind, StaffLinkStatus, StaffStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AUDIT } from "@pulse/shared";
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
});
