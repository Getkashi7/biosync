/**
 * Audit trail writer.
 *
 * Best-effort by design: a failed audit write must never break the user action
 * that triggered it, so this swallows errors. That's the right trade-off while
 * the trail is a supporting record — if it ever becomes the system of record for
 * a regulated claim, this needs to become transactional with the action instead.
 *
 * Metadata always goes through `sanitiseAuditMeta`, which strips nested data and
 * health-bearing keys, so the trail can say a meal was logged without recording
 * what was in it.
 */
import type { Prisma } from "@prisma/client";
import { sanitiseAuditMeta, type AuditAction } from "@pulse/shared";
import { prisma } from "../db";

type RecordArgs = {
  actorId: string;
  action: AuditAction;
  /** whose record it affected, when that differs from the actor */
  subjectId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
};

/** Append one entry. Never throws. */
export async function recordAudit(args: RecordArgs): Promise<void> {
  try {
    const meta = sanitiseAuditMeta(args.meta);
    await prisma.auditLog.create({
      data: {
        actorId: args.actorId,
        subjectId: args.subjectId ?? null,
        action: args.action,
        entity: args.entity ?? null,
        entityId: args.entityId ?? null,
        meta: meta ?? undefined,
      },
    });
  } catch {
    // Never let auditing break the action it describes.
  }
}

/**
 * Append one entry inside a caller-supplied transaction, and THROW if it fails.
 *
 * The opposite trade-off to `recordAudit` above, for the one case that needs it:
 * a §7 treatment decision is a clinical act by a named person, and the trail is
 * the only durable record that it happened. An approval that silently loses its
 * audit row is worse than an approval that fails — so this one is atomic with
 * the status change, and a failed write rolls the decision back with it.
 *
 * Pass the transaction client from `prisma.$transaction`, not `prisma`.
 */
export async function recordAuditTx(
  tx: Prisma.TransactionClient,
  args: RecordArgs,
): Promise<void> {
  const meta = sanitiseAuditMeta(args.meta);
  await tx.auditLog.create({
    data: {
      actorId: args.actorId,
      subjectId: args.subjectId ?? null,
      action: args.action,
      entity: args.entity ?? null,
      entityId: args.entityId ?? null,
      meta: meta ?? undefined,
    },
  });
}
