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
