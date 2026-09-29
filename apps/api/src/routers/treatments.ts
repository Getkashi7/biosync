/**
 * IV therapy & treatments (§7).
 *
 * The most tightly gated surface in the API, because a mistake here is a
 * regulated-medicine mistake rather than a bad screen. The rules it enforces,
 * all of which live in `@pulse/shared` `treatments.ts` so they are reviewable in
 * one place:
 *
 * - **Suggestions are computed, never stored and never generated.** A suggestion
 *   is a pure function of the caller's own readings. There is no model in this
 *   path and no protocol exists that isn't in the code-defined catalogue, so the
 *   API cannot name a medicine it wasn't reviewed to name.
 * - **Nothing is written until the client acts.** Reading suggestions creates no
 *   rows, so the app never accumulates a record of treatments someone merely
 *   saw.
 * - **Only a PRACTITIONER can decide.** `canReview` refuses PT, and unlike every
 *   other staff surface here that ceiling is NOT consent-widenable: a client
 *   cannot elect to let their trainer approve a treatment.
 * - **A decision is atomic with its audit row** (`recordAuditTx`). Everywhere
 *   else in this codebase auditing is best-effort; a clinical decision that lost
 *   its trail would be worse than one that failed outright.
 *
 * No health values are logged anywhere in this file. The frozen `reason` string
 * is health-adjacent free text and never leaves the row it belongs to.
 */
import { MetricType, StaffKind, StaffLinkStatus, TreatmentStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  AUDIT,
  SIGNAL_WINDOW_DAYS,
  canProceedToBooking,
  canReview,
  canTransition,
  countSignals,
  daysUntilExpiry,
  effectiveStatus,
  isOpen,
  protocolName,
  suggestTreatments,
  treatmentDecisionInput,
  treatmentIdInput,
  treatmentRequestInput,
  type SignalDay,
} from "@pulse/shared";
import { router, ownerProcedure, staffProcedure } from "../trpc";
import { staffKinds } from "../context";
import { prisma } from "../db";
import { fromDbDate } from "../dbDate";
import { recordAudit, recordAuditTx } from "../lib/audit";

/** Midnight UTC, `days` ago — the left edge of the signal window. */
function windowStart(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
}

/**
 * The caller's own readings for the window, one entry per day that has any.
 *
 * Days with no reading are simply absent rather than present-and-zero: a day
 * someone didn't open the app is not a day they felt bad, and `countSignals`
 * treats null as "not counted" for exactly that reason.
 */
async function ownSignalDays(userId: string): Promise<SignalDay[]> {
  const since = windowStart(SIGNAL_WINDOW_DAYS);

  const [logs, readiness, hydration] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, energy: true, sleepHours: true },
    }),
    prisma.readinessSnapshot.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, score: true },
    }),
    prisma.metric.findMany({
      where: { userId, type: MetricType.HYDRATION, recordedAt: { gte: since } },
      select: { recordedAt: true, value: true },
    }),
  ]);

  const byDay = new Map<string, SignalDay>();
  const at = (key: string): SignalDay => {
    const existing = byDay.get(key);
    if (existing) return existing;
    const fresh: SignalDay = { energy: null, sleepHours: null, hydrationMl: null, readiness: null };
    byDay.set(key, fresh);
    return fresh;
  };

  for (const l of logs) {
    const day = at(fromDbDate(l.date));
    day.energy = l.energy;
    day.sleepHours = l.sleepHours;
  }
  for (const r of readiness) {
    at(fromDbDate(r.date)).readiness = r.score;
  }
  // Hydration is logged per drink, so a day's intake is the sum of its readings.
  for (const h of hydration) {
    const day = at(h.recordedAt.toISOString().slice(0, 10));
    day.hydrationMl = (day.hydrationMl ?? 0) + h.value;
  }

  return [...byDay.values()];
}

/** The shape every request is returned in, on both the client and staff sides. */
function presentRequest(r: {
  id: string;
  protocolSlug: string;
  status: TreatmentStatus;
  reason: string;
  note: string | null;
  approvedAt: Date | null;
  reviewedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}) {
  const shown = effectiveStatus({ status: r.status, approvedAt: r.approvedAt });
  return {
    id: r.id,
    slug: r.protocolSlug,
    name: protocolName(r.protocolSlug),
    /** what to render — an approval that has lapsed reads as EXPIRED */
    status: shown,
    reason: r.reason,
    note: r.note,
    decisionNote: r.decisionNote,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    /** the ONLY field a booking button may key off */
    canBook: canProceedToBooking({ status: r.status, approvedAt: r.approvedAt }),
    expiresInDays: r.approvedAt && shown === "APPROVED" ? daysUntilExpiry(r.approvedAt) : null,
  };
}

const REQUEST_SELECT = {
  id: true,
  protocolSlug: true,
  status: true,
  reason: true,
  note: true,
  approvedAt: true,
  reviewedAt: true,
  decisionNote: true,
  createdAt: true,
} as const;

export const treatmentsRouter = router({
  /**
   * What the caller's own readings surface, plus what they've already asked
   * about. Read-only: seeing a suggestion writes nothing.
   *
   * A protocol with an open request is filtered out rather than shown with a
   * disabled button — the request itself is already on screen, and offering it
   * twice invites someone to think the first one didn't register.
   */
  suggestions: ownerProcedure.query(async ({ ctx }) => {
    const [days, openRows] = await Promise.all([
      ownSignalDays(ctx.user.id),
      prisma.treatmentRequest.findMany({
        where: {
          userId: ctx.user.id,
          status: { in: [TreatmentStatus.REQUESTED, TreatmentStatus.APPROVED] },
        },
        select: REQUEST_SELECT,
      }),
    ]);

    // An approval that has lapsed no longer occupies the slot, so the protocol
    // becomes suggestable again.
    const occupied = new Set(
      openRows
        .filter((r) => isOpen(effectiveStatus({ status: r.status, approvedAt: r.approvedAt })))
        .map((r) => r.protocolSlug),
    );

    return {
      suggestions: suggestTreatments(countSignals(days)).filter((s) => !occupied.has(s.slug)),
      /** whether a practitioner is actually reachable — see `request` */
      hasPractitioner: await hasPractitionerLink(ctx.user.id),
    };
  }),

  /** Every request the caller has made, newest first. */
  list: ownerProcedure.query(async ({ ctx }) => {
    const rows = await prisma.treatmentRequest.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: REQUEST_SELECT,
    });
    return { requests: rows.map(presentRequest) };
  }),

  /**
   * Ask for a review.
   *
   * Refused when the client has no practitioner: a request nobody can ever see
   * is not a request, and letting it sit in "pending review" forever would be
   * the cruellest possible lie in this feature.
   */
  request: ownerProcedure.input(treatmentRequestInput).mutation(async ({ ctx, input }) => {
    if (!(await hasPractitionerLink(ctx.user.id))) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "You need to be connected to Biomeds before asking for a review.",
      });
    }

    const existing = await prisma.treatmentRequest.findFirst({
      where: {
        userId: ctx.user.id,
        protocolSlug: input.slug,
        status: { in: [TreatmentStatus.REQUESTED, TreatmentStatus.APPROVED] },
      },
      select: { id: true, status: true, approvedAt: true },
    });
    if (existing && isOpen(effectiveStatus(existing))) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "You already have an open request for this review.",
      });
    }

    // Freeze the reason as it reads NOW. A practitioner opening this next week
    // must see what the client saw when they asked, not a figure recomputed
    // from newer readings — the decision was made against this sentence.
    const surfaced = suggestTreatments(countSignals(await ownSignalDays(ctx.user.id))).find(
      (s) => s.slug === input.slug,
    );
    const reason = surfaced
      ? surfaced.reason
      : // Requested without our having surfaced it. Say so plainly rather than
        // inventing a data-derived justification that doesn't exist.
        "You asked for this review yourself. It wasn't suggested from your readings.";

    const created = await prisma.treatmentRequest.create({
      data: {
        userId: ctx.user.id,
        protocolSlug: input.slug,
        reason,
        note: input.note ?? null,
        status: TreatmentStatus.REQUESTED,
      },
      select: REQUEST_SELECT,
    });

    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.treatmentRequested,
      entity: "treatment",
      entityId: created.id,
      meta: { slug: input.slug, surfaced: Boolean(surfaced) },
    });

    return presentRequest(created);
  }),

  /** Back out. Legal from REQUESTED and from APPROVED — permission is not obligation. */
  withdraw: ownerProcedure.input(treatmentIdInput).mutation(async ({ ctx, input }) => {
    const row = await prisma.treatmentRequest.findFirst({
      where: { id: input.id, userId: ctx.user.id },
      select: { id: true, status: true, approvedAt: true, protocolSlug: true },
    });
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });

    const from = effectiveStatus(row);
    if (!canTransition(from, "WITHDRAWN", "CLIENT")) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This request can no longer be withdrawn.",
      });
    }

    await prisma.treatmentRequest.update({
      where: { id: row.id },
      data: { status: TreatmentStatus.WITHDRAWN },
    });
    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.treatmentWithdrawn,
      entity: "treatment",
      entityId: row.id,
      meta: { slug: row.protocolSlug, from },
    });
    return { ok: true as const };
  }),

  /* ---------------------------------------------------------------- */
  /* Practitioner side                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * The review queue: pending requests from clients this caller holds an ACTIVE
   * PRACTITIONER link with.
   *
   * Note what is NOT checked here: consent. Everywhere else a staff read needs
   * the client's consent, but this request was initiated BY the client and asks
   * this practitioner to look at it — the request is the permission. It carries
   * only the frozen reason the client already saw, never their underlying
   * readings, so it grants no wider view of their record.
   */
  reviewQueue: staffProcedure.query(async ({ ctx }) => {
    if (!staffKinds(ctx.user).some(canReview)) {
      // A trainer is not a clinician. Not consent-widenable — see treatments.ts.
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const links = await prisma.staffLink.findMany({
      where: {
        staffId: ctx.user.id,
        status: StaffLinkStatus.ACTIVE,
        kind: StaffKind.PRACTITIONER,
      },
      select: { clientId: true },
    });
    if (links.length === 0) return { requests: [] };

    const rows = await prisma.treatmentRequest.findMany({
      where: {
        userId: { in: links.map((l) => l.clientId) },
        status: TreatmentStatus.REQUESTED,
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { ...REQUEST_SELECT, userId: true, user: { select: { fullName: true, email: true } } },
    });

    return {
      requests: rows.map((r) => ({
        ...presentRequest(r),
        clientId: r.userId,
        clientName: r.user.fullName ?? r.user.email,
      })),
    };
  }),

  /**
   * Approve or decline. The only path to APPROVED in the entire system.
   *
   * The link is re-checked here rather than trusted from the queue: a link can
   * be revoked between loading the queue and pressing the button, and an
   * approval written after that would be made by someone who is no longer this
   * client's practitioner.
   */
  decide: staffProcedure.input(treatmentDecisionInput).mutation(async ({ ctx, input }) => {
    if (!staffKinds(ctx.user).some(canReview)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const row = await prisma.treatmentRequest.findUnique({
      where: { id: input.id },
      select: { id: true, userId: true, status: true, approvedAt: true, protocolSlug: true },
    });
    // NOT_FOUND rather than FORBIDDEN, so the endpoint can't be used to probe
    // which request ids exist.
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });

    const link = await prisma.staffLink.findFirst({
      where: {
        staffId: ctx.user.id,
        clientId: row.userId,
        status: StaffLinkStatus.ACTIVE,
        kind: StaffKind.PRACTITIONER,
      },
      select: { id: true },
    });
    if (!link) throw new TRPCError({ code: "NOT_FOUND" });

    const to = input.decision === "APPROVE" ? "APPROVED" : "DECLINED";
    const from = effectiveStatus(row);
    if (!canTransition(from, to, "PRACTITIONER")) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          from === "REQUESTED"
            ? "This request can no longer be decided."
            : "This request has already been decided.",
      });
    }

    const now = new Date();
    // Atomic with its audit row. See the note on `recordAuditTx`: a clinical
    // decision that lost its trail is worse than one that failed.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.treatmentRequest.update({
          where: { id: row.id, status: TreatmentStatus.REQUESTED },
          data: {
            status:
              input.decision === "APPROVE" ? TreatmentStatus.APPROVED : TreatmentStatus.DECLINED,
            reviewedById: ctx.user.id,
            reviewedAt: now,
            approvedAt: input.decision === "APPROVE" ? now : null,
            decisionNote: input.decision === "APPROVE" ? (input.note ?? null) : input.reason,
          },
        });
        await recordAuditTx(tx, {
          actorId: ctx.user.id,
          subjectId: row.userId,
          action: input.decision === "APPROVE" ? AUDIT.treatmentApproved : AUDIT.treatmentDeclined,
          entity: "treatment",
          entityId: row.id,
          meta: { slug: row.protocolSlug, decision: input.decision },
        });
      });
    } catch (err) {
      // The `status: REQUESTED` guard on the update closes the race between two
      // practitioners deciding at once: the loser's update matches no row and
      // Prisma raises P2025. That is a real, explainable outcome — someone else
      // got there first — not a server fault, so it must not surface as one.
      if ((err as { code?: string }).code === "P2025") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This request has already been decided.",
        });
      }
      throw err;
    }

    return { ok: true as const, status: to };
  }),
});

/**
 * Whether this client has anyone who could actually review a request.
 *
 * Kept next to its callers because both of them need the same answer for the
 * same reason: the app must not invite someone to ask a question nobody will
 * ever read.
 */
async function hasPractitionerLink(userId: string): Promise<boolean> {
  const link = await prisma.staffLink.findFirst({
    where: { clientId: userId, status: StaffLinkStatus.ACTIVE, kind: StaffKind.PRACTITIONER },
    select: { id: true },
  });
  return link !== null;
}
