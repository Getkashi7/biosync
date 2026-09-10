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

/**
 * Which of the three steps an upload died on.
 *
 * "It failed" is not a diagnosis. An upload crosses three separate systems —
 * our API, Supabase Storage, then our API again — and collapsing all of them
 * into one opaque failure is exactly what hid a rejected Groq key for weeks.
 * The tile still shows the same honest "didn't upload", but the log says which
 * hop broke, so the next person does not have to bisect it by hand.
 */
export type UploadStep = "sign" | "read" | "put" | "confirm";

export type UploadResult =
  | { ok: true; id: string }
  | { ok: false; failure: NetFailure; step: UploadStep };

/**
 * What is safe to log here: the step, and an HTTP status or tRPC code.
 *
 * What is NOT, and must never be added: the signed URL or the storage path.
 * Both embed the owner's user id, and CLAUDE.md keeps identifiers of that kind
 * out of logs for the same reason it keeps health values out.
 */
function logUploadFailure(step: UploadStep, detail: string): void {
  console.error(`[photo-upload] failed at "${step}": ${detail}`);
}

/** A tRPC error's code, when it has one. */
function codeOf(err: unknown): string {
  return (err as { data?: { code?: string } })?.data?.code ?? (err as Error)?.message ?? "unknown";
}

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
  let step: UploadStep = "sign";
  try {
    const { path, signedUrl, token } = await trpc.photos.createUploadUrl.mutate({
      takenOn: params.takenOn,
      mimeType: params.mimeType,
      byteSize: params.byteSize,
      audienceOverride: params.audienceOverride,
    });

    // Reading the picked file is its own step: a content:// URI the platform
    // won't hand us reads as a failure that has nothing to do with the network.
    step = "read";
    const blob = await (await fetch(params.uri)).blob();

    step = "put";
    const put = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": params.mimeType, Authorization: `Bearer ${token}` },
      body: blob,
    });
    if (!put.ok) {
      // Supabase puts a JSON reason in the body; it describes the bucket and
      // the request, never the user.
      const body = await put.text().catch(() => "");
      logUploadFailure("put", `HTTP ${put.status} ${body.slice(0, 160)}`);
      return { ok: false, failure: "error", step: "put" };
    }

    step = "confirm";
    const { id } = await trpc.photos.confirmUpload.mutate({
      takenOn: params.takenOn,
      mimeType: params.mimeType,
      byteSize: params.byteSize,
      audienceOverride: params.audienceOverride,
      path,
    });
    return { ok: true, id };
  } catch (err) {
    logUploadFailure(step, codeOf(err));
    return { ok: false, failure: classifyNetError(err), step };
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
