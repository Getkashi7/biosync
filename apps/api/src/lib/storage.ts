/**
 * Supabase Storage access for progress photos.
 *
 * The bucket is private and stays that way. The client never talks to it
 * directly and never sees the service-role key: the API mints short-lived
 * signed URLs after it has checked ownership (and, for staff, link + consent),
 * so authorisation is decided here rather than by a storage policy that can
 * drift out of step with the consent model.
 *
 * No health values and no storage paths in log statements — a path contains the
 * owner's user id.
 */
import { env } from "../env";

export const PHOTO_BUCKET = "progress-photos";

/** Signed URLs live just long enough to load a screen, not to be shared on. */
const READ_TTL_SECONDS = 60 * 5;

function storageHeaders(): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

function assertConfigured(): void {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Storage is not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }
}

/** Extension for the mime types the bucket accepts. */
export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    default:
      return "jpg";
  }
}

/**
 * A one-shot upload URL the device can PUT the image to. Scoped to one exact
 * path, so a client cannot choose where its file lands or overwrite anyone
 * else's — the path is built from the session's user id, never from input.
 */
export async function createSignedUploadUrl(
  path: string,
): Promise<{ signedUrl: string; token: string }> {
  assertConfigured();
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/upload/sign/${PHOTO_BUCKET}/${path}`,
    { method: "POST", headers: storageHeaders() },
  );
  if (!res.ok) throw new Error(`Storage refused an upload URL (${res.status})`);
  const body = (await res.json()) as { url?: string; token?: string };
  if (!body.url || !body.token) throw new Error("Storage returned no upload URL");
  return { signedUrl: `${env.SUPABASE_URL}/storage/v1${body.url}`, token: body.token };
}

/** A short-lived read URL for one object. */
export async function createSignedReadUrl(path: string): Promise<string | null> {
  assertConfigured();
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${PHOTO_BUCKET}/${path}`, {
    method: "POST",
    headers: storageHeaders(),
    body: JSON.stringify({ expiresIn: READ_TTL_SECONDS }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { signedURL?: string };
  return body.signedURL ? `${env.SUPABASE_URL}/storage/v1${body.signedURL}` : null;
}

/**
 * Remove the object itself. Deletion has to reach the bytes, not just the row:
 * the confirm sheet promises the photo is "removed for everyone it's shared
 * with", and a row-only delete would leave the image sitting in the bucket
 * behind a signed URL that has not expired yet.
 */
export async function deleteObject(path: string): Promise<boolean> {
  assertConfigured();
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: "DELETE",
    headers: storageHeaders(),
  });
  return res.ok;
}

/**
 * Remove every object belonging to one user.
 *
 * Account deletion has to reach the bytes, not just the rows. Photo rows go
 * when the user row cascades, but the images would otherwise stay in the
 * bucket forever — unreachable, still stored, and a straight contradiction of
 * what the delete dialog promises. Erasure has to be actual.
 *
 * Best-effort by design: deletion must not be blocked by a storage hiccup, so
 * this reports what it managed rather than throwing. The caller logs a
 * shortfall — never the paths, which contain the user's id.
 */
export async function deleteAllUserObjects(userId: string): Promise<{ deleted: number; failed: number }> {
  assertConfigured();
  let deleted = 0;
  let failed = 0;

  try {
    // Supabase lists at most 100 per call; loop until a page comes back short.
    for (let offset = 0; ; offset += 100) {
      const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${PHOTO_BUCKET}`, {
        method: "POST",
        headers: storageHeaders(),
        body: JSON.stringify({ prefix: `${userId}/`, limit: 100, offset }),
      });
      if (!res.ok) return { deleted, failed: failed + 1 };

      const page = (await res.json()) as { name?: string }[];
      if (!Array.isArray(page) || page.length === 0) return { deleted, failed };

      const paths = page.filter((o) => o.name).map((o) => `${userId}/${o.name}`);
      if (paths.length > 0) {
        const del = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}`, {
          method: "DELETE",
          headers: storageHeaders(),
          body: JSON.stringify({ prefixes: paths }),
        });
        if (del.ok) deleted += paths.length;
        else failed += paths.length;
      }

      if (page.length < 100) return { deleted, failed };
    }
  } catch {
    return { deleted, failed: failed + 1 };
  }
}
