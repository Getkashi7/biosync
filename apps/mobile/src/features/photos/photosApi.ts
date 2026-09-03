/**
 * Data layer for progress photos. Kept apart from the screens so they stay
 * presentation-only.
 *
 * Uploading is two steps on purpose (see the API router): reserve a signed URL,
 * PUT the bytes straight to storage, then record the row. The bytes never pass
 * through the API, and a row is never written for an upload that failed — so
 * the gallery can't end up showing a photo that will never load.
 */
import { trpc } from "../../lib/trpc";
import { classifyNetError, type NetFailure } from "../../lib/netError";


/**
 * Mobile derives its types from the router rather than importing @pulse/shared:
 * shared is type-only here and Metro cannot resolve it, so the tRPC surface is
 * the single source of truth the client already has.
 */
export type PhotoList = Awaited<ReturnType<typeof trpc.photos.list.query>>;
export type ConsentAudience = PhotoList["photos"][number]["audienceOverride"] extends infer A ? NonNullable<A> : never;

export type Photo = {
  id: string;
  takenOn: string;
  audienceOverride: ConsentAudience | null;
  mimeType: string;
  createdAt: string;
  /** Short-lived signed URL, or null when one couldn't be minted. */
  url: string | null;
};

export async function fetchPhotos(limit = 60): Promise<Photo[]> {
  const res = await trpc.photos.list.query({ limit });
  return res.photos as Photo[];
}

/** The PHOTOS consent audience — the gallery-wide default the add sheet opens on. */
export async function fetchPhotosAudience(): Promise<ConsentAudience> {
  const res = await trpc.consent.list.query();
  const row = res.consents.find((c) => c.category === "PHOTOS");
  return (row?.audience ?? "NONE") as ConsentAudience;
}

export type UploadResult = { ok: true; id: string } | { ok: false; failure: NetFailure };

/**
 * Put one photo in the bucket and record it.
 *
 * Returns a classified failure rather than throwing, because the grid renders
 * a failed upload as its own tile with Retry — the user needs to know their
 * photo didn't make it, and whether that was the network or the server.
 */
export async function uploadPhoto(params: {
  uri: string;
  takenOn: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
  byteSize: number;
  audienceOverride: ConsentAudience | null;
}): Promise<UploadResult> {
  try {
    const { path, signedUrl, token } = await trpc.photos.createUploadUrl.mutate({
      takenOn: params.takenOn,
      mimeType: params.mimeType,
      byteSize: params.byteSize,
      audienceOverride: params.audienceOverride,
    });

    const blob = await (await fetch(params.uri)).blob();
    const put = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": params.mimeType, Authorization: `Bearer ${token}` },
      body: blob,
    });
    if (!put.ok) return { ok: false, failure: "error" };

    const { id } = await trpc.photos.confirmUpload.mutate({
      takenOn: params.takenOn,
      mimeType: params.mimeType,
      byteSize: params.byteSize,
      audienceOverride: params.audienceOverride,
      path,
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, failure: classifyNetError(err) };
  }
}

export async function setPhotoVisibility(
  id: string,
  audienceOverride: ConsentAudience | null,
): Promise<void> {
  await trpc.photos.setVisibility.mutate({ id, audienceOverride });
}

/** Delete for real — the API removes the stored image, not just the row. */
export async function deletePhoto(id: string): Promise<void> {
  await trpc.photos.remove.mutate({ id });
}
