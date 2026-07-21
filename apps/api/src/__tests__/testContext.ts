/**
 * Context factory for the authorization tests.
 *
 * Staff capability now lives beside the account rather than in `User.role`, so
 * tests say what an account *can do* explicitly: `ctx({ id, role })` is a plain
 * account with no capability, and `ctx({ id, role, staff: ["PT"] })` is a
 * verified trainer. Only VERIFIED capabilities ever reach the context, so
 * passing one here means "verified" by construction.
 */
import type { Role, StaffKind } from "@prisma/client";
import type { Context } from "../context";

type TestUser = { id: string; role: Role; staff?: StaffKind[] };

export function ctx(user: TestUser | null): Context {
  if (!user) return { user: null };
  return {
    user: {
      id: user.id,
      role: user.role,
      staff: (user.staff ?? []).map((kind) => ({ kind })),
    },
  };
}
