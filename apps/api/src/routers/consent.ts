/**
 * Consent — who sees what.
 *
 * `list` always returns all five categories: any the user has never touched come
 * back as NONE, so a missing row can never be mistaken for permission. `set` is
 * an upsert and is audited, because a change to who can see someone's health
 * data is exactly the kind of event a compliance trail exists for.
 */
import { ConsentCategory, ConsentAudience } from "@prisma/client";
import { AUDIT, consentSetInput, mergeConsents, type ConsentRow } from "@pulse/shared";
import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";
import { recordAudit } from "../lib/audit";

const userProcedure = ownerProcedure;

export const consentRouter = router({
  /** Every category with its current audience, in display order. */
  list: userProcedure.query(async ({ ctx }) => {
    const stored = await prisma.consent.findMany({
      where: { userId: ctx.user.id },
      select: { category: true, audience: true },
    });
    return { consents: mergeConsents(stored as ConsentRow[]) };
  }),

  /** Set one category's audience. Audited — the action, never the data. */
  set: userProcedure.input(consentSetInput).mutation(async ({ ctx, input }) => {
    const category = input.category as ConsentCategory;
    const audience = input.audience as ConsentAudience;

    await prisma.consent.upsert({
      where: { userId_category: { userId: ctx.user.id, category } },
      create: { userId: ctx.user.id, category, audience },
      update: { audience },
    });

    await recordAudit({
      actorId: ctx.user.id,
      action: AUDIT.consentChanged,
      entity: "consent",
      entityId: category,
      meta: { category, audience },
    });

    return { category: input.category, audience: input.audience };
  }),
});
