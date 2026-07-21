/**
 * The link check that gates every staff read and write.
 *
 * Kept in one place because it's a security rule, not a convenience: two copies
 * of "may this trainer touch this client" is two places for it to drift.
 *
 * Unlinked clients are NOT_FOUND rather than FORBIDDEN on purpose — FORBIDDEN
 * would confirm the account exists, turning the endpoint into a way to probe
 * for users.
 */
import { Role, StaffLinkStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { prisma } from "../db";

/** Throws NOT_FOUND unless this staff member has an active link to the client. */
export async function assertLinked(staffId: string, role: Role, clientId: string): Promise<void> {
  const link = await prisma.staffLink.findFirst({
    where: { staffId, clientId, role, status: StaffLinkStatus.ACTIVE },
    select: { id: true },
  });
  if (!link) throw new TRPCError({ code: "NOT_FOUND" });
}
