/**
 * Training plans + session notes.
 *
 * Two audiences, deliberately split:
 *  · staff procedures write, and require an ACTIVE link to that client;
 *  · client procedures read their OWN plan and only the notes a trainer marked
 *    as shared — an unshared note is a trainer's private record and must never
 *    reach the person it's about through this API.
 *
 * Plans and notes are the trainer's own words, not the client's health data, so
 * they sit outside the consent categories — but writing them still requires the
 * link, so a trainer can't author against someone who isn't their client.
 */
import { Role, StaffLinkStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  AUDIT,
  noteCreateInput,
  parsePlanItems,
  planListInput,
  planSaveInput,
} from "@pulse/shared";
import { router, ownerProcedure, staffProcedure } from "../trpc";
import { prisma } from "../db";
import { recordAudit } from "../lib/audit";
import { assertLinked } from "../lib/staffLink";
import { staffKinds } from "../context";

const userProcedure = ownerProcedure;



export const trainingRouter = router({
  /** Plans this trainer has written for one client, newest week first. */
  plans: staffProcedure.input(planListInput).query(async ({ ctx, input }) => {
    await assertLinked(ctx.user.id, staffKinds(ctx.user), input.clientId);
    const rows = await prisma.trainingPlan.findMany({
      where: { trainerId: ctx.user.id, clientId: input.clientId },
      orderBy: { week: "desc" },
      select: { id: true, week: true, title: true, items: true, updatedAt: true },
    });
    return { plans: rows.map((p) => ({ ...p, items: parsePlanItems(p.items) })) };
  }),

  /** Create or replace the plan for a client's week. */
  savePlan: staffProcedure.input(planSaveInput).mutation(async ({ ctx, input }) => {
    await assertLinked(ctx.user.id, staffKinds(ctx.user), input.clientId);
    const plan = await prisma.trainingPlan.upsert({
      where: {
        trainerId_clientId_week: { trainerId: ctx.user.id, clientId: input.clientId, week: input.week },
      },
      create: {
        trainerId: ctx.user.id,
        clientId: input.clientId,
        week: input.week,
        title: input.title,
        items: input.items,
      },
      update: { title: input.title, items: input.items },
      select: { id: true },
    });
    await recordAudit({
      actorId: ctx.user.id,
      subjectId: input.clientId,
      action: AUDIT.planSaved,
      entity: "plan",
      entityId: plan.id,
      meta: { week: input.week, exercises: input.items.length },
    });
    return { id: plan.id };
  }),

  /** Notes this trainer wrote about one client — including their private ones. */
  notes: staffProcedure.input(planListInput).query(async ({ ctx, input }) => {
    await assertLinked(ctx.user.id, staffKinds(ctx.user), input.clientId);
    const notes = await prisma.sessionNote.findMany({
      where: { trainerId: ctx.user.id, clientId: input.clientId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, body: true, sharedWithClient: true, createdAt: true },
    });
    return { notes };
  }),

  /** Write a session note. `sharedWithClient` decides if the client can read it. */
  addNote: staffProcedure.input(noteCreateInput).mutation(async ({ ctx, input }) => {
    await assertLinked(ctx.user.id, staffKinds(ctx.user), input.clientId);
    const note = await prisma.sessionNote.create({
      data: {
        trainerId: ctx.user.id,
        clientId: input.clientId,
        body: input.body,
        sharedWithClient: input.sharedWithClient,
      },
      select: { id: true },
    });
    await recordAudit({
      actorId: ctx.user.id,
      subjectId: input.clientId,
      action: AUDIT.noteWritten,
      entity: "note",
      entityId: note.id,
      meta: { shared: input.sharedWithClient },
    });
    return { id: note.id };
  }),

  // ── the client's own side ──────────────────────────────────────────────────

  /** The caller's current plans, from any trainer. */
  myPlans: userProcedure.query(async ({ ctx }) => {
    const rows = await prisma.trainingPlan.findMany({
      where: { clientId: ctx.user.id },
      orderBy: { week: "desc" },
      take: 8,
      select: { id: true, week: true, title: true, items: true, updatedAt: true },
    });
    return { plans: rows.map((p) => ({ ...p, items: parsePlanItems(p.items) })) };
  }),

  /**
   * Notes written about the caller — ONLY those the trainer chose to share. An
   * unshared note is never returned here.
   */
  myNotes: userProcedure.query(async ({ ctx }) => {
    const notes = await prisma.sessionNote.findMany({
      where: { clientId: ctx.user.id, sharedWithClient: true },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, body: true, createdAt: true },
    });
    return { notes };
  }),

  /**
   * Everything a trainer has shared with the caller — their plans and the notes
   * marked shared — in one round-trip, each tagged with who wrote it. This is the
   * client's window into their coaching; an unshared note is still never here.
   */
  mine: userProcedure.query(async ({ ctx }) => {
    const [plans, notes] = await Promise.all([
      prisma.trainingPlan.findMany({
        where: { clientId: ctx.user.id },
        orderBy: { week: "desc" },
        take: 8,
        select: {
          id: true,
          week: true,
          title: true,
          items: true,
          updatedAt: true,
          trainer: { select: { fullName: true, email: true } },
        },
      }),
      prisma.sessionNote.findMany({
        where: { clientId: ctx.user.id, sharedWithClient: true },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          body: true,
          createdAt: true,
          trainer: { select: { fullName: true, email: true } },
        },
      }),
    ]);

    return {
      plans: plans.map((p) => ({
        id: p.id,
        week: p.week,
        title: p.title,
        items: parsePlanItems(p.items),
        updatedAt: p.updatedAt,
        from: p.trainer.fullName ?? p.trainer.email,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt,
        from: n.trainer.fullName ?? n.trainer.email,
      })),
    };
  }),
});
