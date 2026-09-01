/**
 * Progress photos (§1) — validation and the visibility rule.
 *
 * These are the most sensitive records in the app: pictures of someone's body,
 * kept like a locked diary rather than a feed. Two rules follow from that and
 * are enforced here rather than left to a screen:
 *
 * 1. **A per-photo override can only make a photo more private.** It is
 *    intersected with the PHOTOS category consent, never used to widen past it,
 *    so one photo can never reach someone the user hasn't consented to.
 * 2. **Absence of a decision is not permission** — no override and no category
 *    consent both resolve to NONE, matching `consent.ts`.
 */
import { z } from "zod";
import { consentAudience, type ConsentAudience } from "./consent";
import { dateStringSchema } from "./checkin";

/** What a photo may be overridden to. NONE = "only me" for this photo alone. */
export const photoAudience = consentAudience;

export const photoUploadInput = z.object({
  /** The day the photo represents, device-local YYYY-MM-DD. */
  takenOn: dateStringSchema,
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
  /** Bytes. Capped to match the storage bucket's own 10 MB limit. */
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  /** Null = follow the PHOTOS category consent. */
  audienceOverride: consentAudience.nullable().default(null),
});
export type PhotoUploadInput = z.infer<typeof photoUploadInput>;

export const photoIdInput = z.object({ id: z.string().uuid() });
export type PhotoIdInput = z.infer<typeof photoIdInput>;

export const photoVisibilityInput = z.object({
  id: z.string().uuid(),
  /** Null resets the photo to the gallery-wide default. */
  audienceOverride: consentAudience.nullable(),
});
export type PhotoVisibilityInput = z.infer<typeof photoVisibilityInput>;

export const photoListInput = z
  .object({ limit: z.number().int().min(1).max(200).default(60) })
  .default({ limit: 60 });
export type PhotoListInput = z.infer<typeof photoListInput>;

/**
 * Who can actually see one photo.
 *
 * The override never widens: if the category consent is NONE the photo is
 * private whatever the override says, and an override naming a *different*
 * audience than the category consent resolves to NONE rather than to either —
 * "my practitioner" while only a trainer is consented must not fall back to
 * showing the trainer.
 */
export function effectivePhotoAudience(
  override: ConsentAudience | null,
  categoryAudience: ConsentAudience,
): ConsentAudience {
  if (categoryAudience === "NONE") return "NONE";
  if (override === null) return categoryAudience;
  if (override === "NONE") return "NONE";
  return override === categoryAudience ? override : "NONE";
}

/**
 * Whether the thumbnail should carry the lock chip: the photo differs from the
 * gallery-wide default, so its privacy is not what the gallery implies.
 */
export function hasVisibilityOverride(
  override: ConsentAudience | null,
  categoryAudience: ConsentAudience,
): boolean {
  return override !== null && override !== categoryAudience;
}

/** "2026-08-28" → "28 AUG", the Doto date on a tile. */
export function tileDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const monthIndex = Number(m[2]) - 1;
  const month = months[monthIndex];
  if (!month) return "";
  return `${m[3]} ${month}`;
}

/** "2026-08-28" → "August 2026", the month heading the grid groups under. */
export function monthHeading(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthIndex = Number(m[2]) - 1;
  const month = months[monthIndex];
  if (!month) return "";
  return `${month} ${m[1]}`;
}

/**
 * Group photos into the dated sections the gallery renders, newest first.
 * Pure so both sides can rely on identical ordering.
 */
export function groupByMonth<T extends { takenOn: string }>(
  photos: T[],
): { heading: string; photos: T[] }[] {
  const out: { heading: string; photos: T[] }[] = [];
  for (const photo of [...photos].sort((a, b) => b.takenOn.localeCompare(a.takenOn))) {
    const heading = monthHeading(photo.takenOn);
    const last = out[out.length - 1];
    if (last && last.heading === heading) last.photos.push(photo);
    else out.push({ heading, photos: [photo] });
  }
  return out;
}
