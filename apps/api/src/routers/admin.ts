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
import { StaffKind, StaffStatus } from "@prisma/client";
import { z } from "zod";
import { AUDIT } from "@pulse/shared";
import { router, adminProcedure } from "../trpc";
import { prisma } from "../db";
import { recordAudit } from "../lib/audit";

const staffKind = z.enum(["PT", "PRACTITIONER"]);

const grantInput = z.object({
  userId: z.string().uuid(),
  kind: staffKind,
  /** registration number, insurer, whatever was checked — free text for now */
  credential: z.string().max(200).nullish(),
});

const revokeInput = z.object({ userId: z.string().uuid(), kind: staffKind });

export const adminRouter = router({
  /** Liveness/stat stub — kept from the original admin surface. */
  stats: adminProcedure.query(() => ({ users: 0, generatedAt: new Date().toISOString() })),

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
