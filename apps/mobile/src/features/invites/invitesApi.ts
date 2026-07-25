/**
 * Data layer for client invitations — the codes that connect a client to a
 * trainer or practitioner.
 *
 * Kept apart from the screens so the UI stays presentation-only. The plaintext
 * code comes back from `create` exactly once and is never recoverable, so the
 * reveal screen is the only place it can be shown.
 */
import { TRPCClientError } from "@trpc/client";
import { trpc } from "../../lib/trpc";

export type StaffKind = "PT" | "PRACTITIONER";

export type CreatedInvite = Awaited<ReturnType<typeof trpc.invites.create.mutate>>;
export type InviteList = Awaited<ReturnType<typeof trpc.invites.list.query>>;
export type InviteSummary = InviteList["invites"][number];
export type InvitePreview = Awaited<ReturnType<typeof trpc.invites.preview.query>>;
export type CareTeam = Awaited<ReturnType<typeof trpc.invites.myStaff.query>>;
export type CareTeamMember = CareTeam["staff"][number];

/** Why a code can't be used. Drives which of the four error screens shows. */
export type CodeFailure = "invalid" | "expired" | "used" | "account";

/** Mint an invitation. The returned `code` is shown once and never again. */
export async function createInvite(kind: StaffKind, email?: string): Promise<CreatedInvite> {
  return trpc.invites.create.mutate(email ? { kind, email } : { kind });
}

export async function fetchInvites(): Promise<InviteList> {
  return trpc.invites.list.query();
}

export async function revokeInvite(id: string): Promise<void> {
  await trpc.invites.revoke.mutate({ id });
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  return trpc.invites.preview.query({ code });
}

export async function acceptInvite(code: string): Promise<void> {
  await trpc.invites.accept.mutate({ code });
}

export async function fetchCareTeam(): Promise<CareTeam> {
  return trpc.invites.myStaff.query();
}

export async function disconnectStaff(linkId: string): Promise<void> {
  await trpc.invites.disconnect.mutate({ id: linkId });
}

/**
 * Map a server rejection onto the four failure screens.
 *
 * The server deliberately words these itself (and deliberately does NOT say
 * which address a locked invite was for), so we classify on the message rather
 * than re-deriving state the client can't see.
 */
export function classifyFailure(err: unknown): CodeFailure {
  if (!(err instanceof TRPCClientError)) return "invalid";
  const msg = String(err.message).toLowerCase();
  if (msg.includes("expired")) return "expired";
  if (msg.includes("already been used")) return "used";
  if (msg.includes("different account")) return "account";
  return "invalid";
}

/** "PT" → "trainer", for sentences like "connect as your trainer". */
export function kindNoun(kind: StaffKind): string {
  return kind === "PT" ? "trainer" : "practitioner";
}
