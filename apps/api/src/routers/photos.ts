/**
 * Progress photos (§1). The most sensitive surface in the app — pictures of
 * someone's body — so the rules are stricter than elsewhere and live in
 * middleware and shared logic rather than in a screen:
 *
 * - Every read is scoped to `ctx.user.id`. There is no procedure here that
 *   takes an owner from input.
 * - The bucket is private; the client gets short-lived signed URLs, minted only
 *   after ownership is checked.
 * - Deleting removes the object as well as the row, because the confirm sheet
 *   promises the photo is gone for everyone, not merely hidden.
 *
 * Staff access (`clientList`) is the one read that is not the owner's own, and
 * it clears three gates in order: an ACTIVE StaffLink, the PHOTOS consent
 * within the role's ceiling, and then `effectivePhotoAudience` PER PHOTO. The
 * third is what makes a per-photo override mean something — a client who hid
 * one photo from their trainer stays hidden even though the category is shared.
 * It is also the only read here that is audited, under its own action.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { StaffLinkStatus, type StaffKind } from "@prisma/client";
import {
  AUDIT,
  ROLE_AUDIENCE,
  clientPhotoListInput,
  effectivePhotoAudience,
  mergeConsents,
  photoIdInput,
  photoListInput,
  photoUploadInput,
  photoVisibilityInput,
  staffVisibleCategories,
  type ConsentRow,
  type StaffRole,
} from "@pulse/shared";
import { router, ownerProcedure, staffProcedure } from "../trpc";
import { staffKinds } from "../context";
import { prisma } from "../db";
import { recordAudit } from "../lib/audit";
import {
  createSignedReadUrl,
  createSignedUploadUrl,
  deleteObject,
  extensionFor,
  storageConfigured,
} from "../lib/storage";

const userProcedure = ownerProcedure;

/**
 * The consent role a link's capacity corresponds to.
 *
 * Mirrors `asStaffRole` in `staff.ts`. The two are three lines and identical on
 * purpose: this is an authorization mapping, and importing it across routers to
 * save them would put a security rule behind an import cycle.
 */
function asStaffRole(kind: StaffKind): StaffRole {
  return kind === "PRACTITIONER" ? "PRACTITIONER" : "PT";
}

/** YYYY-MM-DD from a Date column, without a timezone shifting the day. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const photosRouter = router({
  /**
   * The user's own gallery, newest first, each with a short-lived read URL.
   *
   * A photo whose signed URL cannot be minted is still returned, with a null
   * url: the grid renders it as a tile that failed to load rather than
   * silently dropping it, because a photo vanishing from your own timeline is
   * alarming in a way "couldn't load this one" is not.
   */
  list: userProcedure.input(photoListInput).query(async ({ ctx, input }) => {
    const rows = await prisma.photo.findMany({
      where: { userId: ctx.user.id },
      orderBy: [{ takenOn: "desc" }, { createdAt: "desc" }],
      take: input.limit,
      select: {
        id: true,
        storagePath: true,
        takenOn: true,
        audienceOverride: true,
        mimeType: true,
        createdAt: true,
      },
    });

    const photos = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        takenOn: isoDay(r.takenOn),
        audienceOverride: r.audienceOverride,
        mimeType: r.mimeType,
        createdAt: r.createdAt.toISOString(),
        url: await createSignedReadUrl(r.storagePath),
      })),
    );
    return { photos };
  }),

  /**
   * One client's gallery, for a staff member who is allowed to see it.
   *
   * Three gates, in this order, and none of them is optional:
   *
   * 1. **An ACTIVE `StaffLink`**, matched on a capacity the caller actually
   *    holds. No link is NOT_FOUND, never FORBIDDEN — FORBIDDEN would confirm
   *    the account exists and turn this into a way to probe for users.
   * 2. **The PHOTOS consent**, capped by the role's ceiling. The capacity comes
   *    from the LINK, so someone who is a practitioner elsewhere cannot read a
   *    PT client's gallery by virtue of the wider ceiling.
   * 3. **`effectivePhotoAudience` per photo.** This is the one that makes a
   *    per-photo override mean something: a client who shared the category with
   *    their trainer but hid one photo keeps that photo hidden here.
   *
   * `shared: false` is returned rather than an empty list when the consent is
   * absent, because "they have not shared their photos" and "they have not
   * taken any" are different sentences and the screen must not pick the wrong
   * one.
   */
  clientList: staffProcedure.input(clientPhotoListInput).query(async ({ ctx, input }) => {
    // The gate and the consent together: consent is discarded when there is no
    // link, so reading both at once is safe and costs one round-trip.
    const [link, stored] = await Promise.all([
      prisma.staffLink.findFirst({
        where: {
          staffId: ctx.user.id,
          clientId: input.clientId,
          status: StaffLinkStatus.ACTIVE,
          AND: [{ kind: { not: null } }, { kind: { in: staffKinds(ctx.user) } }],
        },
        select: { kind: true, client: { select: { fullName: true, email: true } } },
      }),
      prisma.consent.findMany({
        where: { userId: input.clientId },
        select: { category: true, audience: true },
      }),
    ]);
    if (!link?.kind) throw new TRPCError({ code: "NOT_FOUND" });

    const staffRole = asStaffRole(link.kind);
    const merged = mergeConsents(stored as ConsentRow[]);
    const visible = staffVisibleCategories(merged, staffRole);
    const clientName = link.client.fullName ?? link.client.email;

    if (!visible.includes("PHOTOS")) {
      // Not an error, and not an empty gallery. Nothing is read from the photo
      // table at all — an unconsented category is never queried.
      return { shared: false as const, clientName, photos: [] };
    }

    const categoryAudience = merged.find((c) => c.category === "PHOTOS")?.audience ?? "NONE";
    const mine = ROLE_AUDIENCE[staffRole];

    // Over-fetch a little, because the per-photo override filter runs after the
    // query — the audience rules are shared code and stay there rather than
    // becoming a second, drifting copy in SQL.
    const rows = await prisma.photo.findMany({
      where: { userId: input.clientId },
      orderBy: [{ takenOn: "desc" }, { createdAt: "desc" }],
      take: input.limit * 2,
      select: {
        id: true,
        storagePath: true,
        takenOn: true,
        audienceOverride: true,
        mimeType: true,
        createdAt: true,
      },
    });

    const allowed = rows
      .filter((r) => effectivePhotoAudience(r.audienceOverride, categoryAudience) === mine)
      .slice(0, input.limit);

    const photos = await Promise.all(
      allowed.map(async (r) => ({
        id: r.id,
        takenOn: isoDay(r.takenOn),
        mimeType: r.mimeType,
        createdAt: r.createdAt.toISOString(),
        url: await createSignedReadUrl(r.storagePath),
        // Deliberately NOT returned: `audienceOverride`. Who else the client
        // shares a photo with is their business, not this reader's.
      })),
    );

    // Audited, and audited even when the result is empty: "who looked" is the
    // question, and an empty gallery was still opened.
    await recordAudit({
      actorId: ctx.user.id,
      subjectId: input.clientId,
      action: AUDIT.staffViewedPhotos,
      entity: "photo",
      meta: { role: staffRole, shown: photos.length },
    });

    return { shared: true as const, clientName, photos };
  }),

  /**
   * Step one of an upload: reserve a path and hand back a one-shot signed URL.
   *
   * The row is not created here. A row written before the bytes arrive would
   * show as a photo that renders as broken forever if the upload never
   * finished — so the row waits for `confirmUpload`.
   */
  createUploadUrl: userProcedure.input(photoUploadInput).mutation(async ({ ctx, input }) => {
    // Said plainly, before trying: a deploy with no storage key cannot ever
    // succeed here, and telling the user "something went wrong, try again"
    // invites them to retry something that will fail every time. This is the
    // same distinction the coach draws between "not switched on" and "broke".
    if (!storageConfigured()) {
      console.error(
        "[storage] photo upload attempted, but this deploy has no storage credentials " +
          "(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
      );
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Photo storage isn't switched on for this app yet. Nothing was saved.",
      });
    }

    // The path is derived from the session, never from input: a client cannot
    // choose where its file lands or overwrite another user's object.
    const path = `${ctx.user.id}/${randomUUID()}.${extensionFor(input.mimeType)}`;
    try {
      const { signedUrl, token } = await createSignedUploadUrl(path);
      return { path, signedUrl, token };
    } catch (err) {
      // The user-facing message stays vague on purpose — they can do nothing
      // about it either way. The SERVER log must not be, though: swallowing the
      // cause here is what made an unconfigured bucket look identical to a
      // network blip, and it is the same mistake the Groq client used to make.
      //
      // Safe to log: the reason. NOT safe, and deliberately absent: `path`,
      // which begins with the owner's user id.
      const reason = err instanceof Error ? err.message : "unknown";
      console.error(`[storage] could not sign an upload URL — ${reason}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not start the upload. Nothing was saved.",
      });
    }
  }),

  /** Step two: the bytes are in the bucket, so record the photo. */
  confirmUpload: userProcedure
    .input(photoUploadInput.extend({ path: z.string().min(1).max(512) }))
    .mutation(async ({ ctx, input }) => {
      // The path came back from the client, so re-check it belongs to this
      // user rather than trusting it — otherwise a caller could attach someone
      // else's object to their own gallery row.
      if (!input.path.startsWith(`${ctx.user.id}/`)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const photo = await prisma.photo.create({
        data: {
          userId: ctx.user.id,
          storagePath: input.path,
          takenOn: new Date(`${input.takenOn}T00:00:00.000Z`),
          audienceOverride: input.audienceOverride,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
        },
        select: { id: true },
      });
      return { id: photo.id };
    }),

  /** Change one photo's visibility, or reset it to the gallery default. */
  setVisibility: userProcedure.input(photoVisibilityInput).mutation(async ({ ctx, input }) => {
    const { count } = await prisma.photo.updateMany({
      where: { id: input.id, userId: ctx.user.id },
      data: { audienceOverride: input.audienceOverride },
    });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
    return { ok: true };
  }),

  /**
   * Delete a photo for real — object first, then row.
   *
   * That order matters: if the object delete fails we stop and keep the row,
   * so the user still sees the photo and can try again. The reverse order
   * would drop the row while the image stayed in the bucket, leaving the user
   * told it was deleted when it was not.
   */
  remove: userProcedure.input(photoIdInput).mutation(async ({ ctx, input }) => {
    const photo = await prisma.photo.findFirst({
      where: { id: input.id, userId: ctx.user.id },
      select: { id: true, storagePath: true },
    });
    if (!photo) throw new TRPCError({ code: "NOT_FOUND" });

    const objectGone = await deleteObject(photo.storagePath);
    if (!objectGone) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "The photo could not be deleted. It has not been removed — please try again.",
      });
    }
    await prisma.photo.delete({ where: { id: photo.id } });
    return { ok: true };
  }),
});
