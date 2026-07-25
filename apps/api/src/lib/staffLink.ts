/**
 * The link check that gates every staff read and write.
 *
 * Kept in one place because it's a security rule, not a convenience: two copies
 * of "may this trainer touch this client" is two places for it to drift.
 *
 * Matching is on the link's `kind` against the capabilities the caller actually
 * holds — NOT on `User.role`. Those came apart when capability moved to
 * StaffProfile: a properly granted trainer keeps `role = USER`, so a role-based
 * match found none of their links. The link says which capacity it is; the
 * caller must hold that capacity.
 *
 * Unlinked clients are NOT_FOUND rather than FORBIDDEN on purpose — FORBIDDEN
 * would confirm the account exists, turning the endpoint into a way to probe
 * for users.
 */
import { StaffKind, StaffLinkStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { prisma } from "../db";

/**
 * Assert an active link and return the capacity it is held in.
 *
 * The returned kind is what the caller must apply the consent ceiling with: a
 * person who is both a PT and a practitioner sees a given client through the
 * capacity that particular link was formed in, never the wider of the two.
 */
export async function assertLinked(
  staffId: string,
  capabilities: readonly StaffKind[],
  clientId: string,
): Promise<StaffKind> {
  // No capability, no link — checked before querying so an empty `in` clause
  // can never be interpreted as "match anything".
  if (capabilities.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

  const link = await prisma.staffLink.findFirst({
    where: {
      staffId,
      clientId,
      kind: { in: [...capabilities] },
      status: StaffLinkStatus.ACTIVE,
    },
    select: { kind: true },
  });
  if (!link?.kind) throw new TRPCError({ code: "NOT_FOUND" });
  return link.kind;
}
