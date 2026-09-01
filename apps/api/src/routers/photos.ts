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
 * Staff access is deliberately NOT implemented here yet: it needs an active
 * StaffLink AND the PHOTOS consent AND the per-photo override intersection
 * (`effectivePhotoAudience`), and it belongs with the §9 practitioner surface
 * where it can be tested end to end. Until then a photo is visible only to the
 * person who took it.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  photoIdInput,
  photoListInput,
  photoUploadInput,
  photoVisibilityInput,
} from "@pulse/shared";
import { router, ownerProcedure } from "../trpc";
import { prisma } from "../db";
import { createSignedReadUrl, createSignedUploadUrl, deleteObject, extensionFor } from "../lib/storage";

const userProcedure = ownerProcedure;

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
   * Step one of an upload: reserve a path and hand back a one-shot signed URL.
   *
   * The row is not created here. A row written before the bytes arrive would
   * show as a photo that renders as broken forever if the upload never
   * finished — so the row waits for `confirmUpload`.
   */
  createUploadUrl: userProcedure.input(photoUploadInput).mutation(async ({ ctx, input }) => {
    // The path is derived from the session, never from input: a client cannot
    // choose where its file lands or overwrite another user's object.
    const path = `${ctx.user.id}/${randomUUID()}.${extensionFor(input.mimeType)}`;
    try {
      const { signedUrl, token } = await createSignedUploadUrl(path);
      return { path, signedUrl, token };
    } catch {
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
