/**
 * Client invitations — how a trainer and a client actually get connected.
 *
 * Until now the only way to create a StaffLink was a seed script, so the whole
 * professional surface was unreachable in a real deployment.
 *
 * The security shape, which is the reason most of this code exists:
 *
 *  - **The client accepts.** Staff issue a code; they never attach themselves
 *    to someone's account. The link is what later permits reading that person's
 *    data, so it takes an act by its subject.
 *  - **Accepting grants no consent.** A new link sees nothing at all until the
 *    client shares a category in the consent centre. Connection and disclosure
 *    are separate decisions and stay that way.
 *  - **The code is a credential**: CSPRNG-generated, stored only as a SHA-256
 *    hash, single-use, expiring, revocable, and optionally locked to one email.
 *    A database dump must not yield redeemable invitations.
 */
import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { StaffKind, StaffLinkStatus, Role } from "@prisma/client";
import {
  AUDIT,
  buildInviteCode,
  inviteCodeInput,
  inviteCreateInput,
  inviteExpiry,
  inviteRevokeInput,
  inviteState,
  isRedeemable,
} from "@pulse/shared";
import { router, staffProcedure, protectedProcedure } from "../trpc";
import { staffKinds } from "../context";
import { prisma } from "../db";
import { recordAudit } from "../lib/audit";

/**
 * Codes are looked up by hash, never by plaintext, so the stored value is
 * useless to anyone who reads the table. Plain SHA-256 (not a password KDF) is
 * the right tool here: the input is 37 bits of CSPRNG output rather than a
 * human-chosen secret, so there's no dictionary to attack, and the lookup has
 * to be a single indexed query.
 */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Never expose the hash or the raw row; the client only needs its lifecycle. */
function toSummary(inv: {
  id: string;
  kind: StaffKind;
  email: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  client: { fullName: string | null; email: string } | null;
}) {
  return {
    id: inv.id,
    kind: inv.kind,
    email: inv.email,
    state: inviteState(inv),
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
    acceptedBy: inv.client ? (inv.client.fullName ?? inv.client.email) : null,
  };
}

export const invitesRouter = router({
  /**
   * Mint an invitation. The plaintext code is returned exactly once, here —
   * it is not recoverable afterwards, by design.
   */
  create: staffProcedure.input(inviteCreateInput).mutation(async ({ ctx, input }) => {
    // A trainer can only invite in a capacity they actually hold, or they could
    // mint a practitioner link (a far wider data ceiling) from a PT account.
    if (!staffKinds(ctx.user).includes(input.kind as StaffKind)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You don't hold that capacity." });
    }

    const code = buildInviteCode((n) => randomBytes(n));
    const invite = await prisma.clientInvite.create({
      data: {
        staffId: ctx.user.id,
        kind: input.kind as StaffKind,
        codeHash: hashCode(code),
        email: input.email?.toLowerCase() ?? null,
        expiresAt: inviteExpiry(),
      },
      select: { id: true, kind: true, email: true, expiresAt: true, createdAt: true },
    });

    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.inviteCreated,
      entity: "invite",
      entityId: invite.id,
      // Never the code itself — an audit row must not be redeemable.
      meta: { kind: invite.kind, restricted: invite.email !== null },
    });

    return { id: invite.id, code, expiresAt: invite.expiresAt, kind: invite.kind };
  }),

  /** The caller's own invitations, newest first. */
  list: staffProcedure.query(async ({ ctx }) => {
    const rows = await prisma.clientInvite.findMany({
      where: { staffId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        client: { select: { fullName: true, email: true } },
      },
    });
    return { invites: rows.map(toSummary) };
  }),

  /** Withdraw an unused invitation. */
  revoke: staffProcedure.input(inviteRevokeInput).mutation(async ({ ctx, input }) => {
    // Scoped by staffId so one staff member can't revoke another's invitation.
    const { count } = await prisma.clientInvite.updateMany({
      where: { id: input.id, staffId: ctx.user.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });

    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.inviteRevoked,
      entity: "invite",
      entityId: input.id,
    });
    return { ok: true };
  }),

  /**
   * What a code refers to, before committing to it — so the client sees who is
   * asking and in what capacity rather than accepting blind.
   *
   * Any authenticated account may call this: it's the client side of the flow,
   * and clients are not staff. It reveals only the inviter's display name and
   * capacity, and only to someone who already holds a valid code.
   */
  preview: protectedProcedure.input(inviteCodeInput).query(async ({ ctx, input }) => {
    const invite = await prisma.clientInvite.findUnique({
      where: { codeHash: hashCode(input.code) },
      select: {
        kind: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        staffId: true,
        staff: { select: { fullName: true, email: true } },
      },
    });
    // A bad code and a spent code are both "not usable" — but the states are
    // distinguished here because the holder already has the code, and "this
    // expired" is far more useful than a blank rejection.
    if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "That code isn't valid." });

    const state = inviteState(invite);
    return {
      state,
      kind: invite.kind,
      from: invite.staff.fullName ?? invite.staff.email,
      /** true when the caller is the same account that issued it */
      isSelf: invite.staffId === ctx.user.id,
      /** true when the invite is locked to a different email than the caller's */
      wrongAccount: invite.email !== null && invite.email !== ctx.user.email.toLowerCase(),
    };
  }),

  /**
   * Redeem a code: create the link, as the client.
   *
   * The spend and the link creation are one transaction, and the spend is a
   * conditional update — so two devices racing the same code produce exactly
   * one link, and a failure part-way can't leave a spent code with no link.
   */
  accept: protectedProcedure.input(inviteCodeInput).mutation(async ({ ctx, input }) => {
    const invite = await prisma.clientInvite.findUnique({
      where: { codeHash: hashCode(input.code) },
      select: {
        id: true,
        staffId: true,
        kind: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });
    if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "That code isn't valid." });

    if (!isRedeemable(invite)) {
      const state = inviteState(invite);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          state === "expired" ? "That code has expired." : "That code has already been used.",
      });
    }

    // Self-linking would let a staff account become its own client, which makes
    // the roster meaningless and the audit trail misleading.
    if (invite.staffId === ctx.user.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You can't accept your own invitation." });
    }

    if (invite.email !== null && invite.email !== ctx.user.email.toLowerCase()) {
      // Deliberately vague: confirming which address it *was* meant for would
      // leak a third party's email to whoever holds the code.
      throw new TRPCError({ code: "FORBIDDEN", message: "This invitation is for a different account." });
    }

    const staffId = invite.staffId;
    const kind = invite.kind;
    const clientId = ctx.user.id;

    await prisma.$transaction(async (tx) => {
      // Conditional spend: whichever request updates the row first wins, and a
      // second concurrent attempt matches zero rows and is rejected.
      const spend = await tx.clientInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date(), acceptedBy: clientId },
      });
      if (spend.count === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That code has already been used." });
      }

      // Re-accepting after a revoked link (a client who left and came back)
      // reactivates the same row rather than failing on the unique constraint.
      await tx.staffLink.upsert({
        where: {
          clientId_staffId_role: { clientId, staffId, role: kindToRole(kind) },
        },
        create: {
          clientId,
          staffId,
          kind,
          role: kindToRole(kind),
          status: StaffLinkStatus.ACTIVE,
        },
        update: { status: StaffLinkStatus.ACTIVE, kind },
      });
    });

    await recordAudit({
      actorId: clientId,
      subjectId: clientId,
      action: AUDIT.inviteAccepted,
      entity: "invite",
      entityId: invite.id,
      meta: { kind, staffId },
    });

    return { ok: true, kind };
  }),

  /** The client's own care team, so they can see and end connections. */
  myStaff: protectedProcedure.query(async ({ ctx }) => {
    const links = await prisma.staffLink.findMany({
      where: { clientId: ctx.user.id, status: StaffLinkStatus.ACTIVE },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        createdAt: true,
        staff: { select: { fullName: true, email: true } },
      },
    });
    return {
      staff: links.map((l) => ({
        id: l.id,
        kind: l.kind,
        since: l.createdAt,
        name: l.staff.fullName ?? l.staff.email,
      })),
    };
  }),

  /**
   * End a connection, from the client's side.
   *
   * REVOKED rather than deleted: the audit trail has to keep saying that this
   * staff member could see this client during that period. `assertLinked` only
   * ever matches ACTIVE, so access stops immediately.
   */
  disconnect: protectedProcedure
    .input(inviteRevokeInput)
    .mutation(async ({ ctx, input }) => {
      const { count } = await prisma.staffLink.updateMany({
        where: { id: input.id, clientId: ctx.user.id, status: StaffLinkStatus.ACTIVE },
        data: { status: StaffLinkStatus.REVOKED },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });

      await recordAudit({
        actorId: ctx.user.id,
        subjectId: ctx.user.id,
        action: AUDIT.linkRevoked,
        entity: "staffLink",
        entityId: input.id,
      });
      return { ok: true };
    }),
});

/**
 * The legacy `role` column is still NOT NULL and part of the link's unique key,
 * so writes must keep populating it until the drop migration lands. Reads all
 * use `kind`.
 */
function kindToRole(kind: StaffKind): Role {
  return kind === StaffKind.PT ? Role.PT : Role.PRACTITIONER;
}
