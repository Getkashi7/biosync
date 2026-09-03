/**
 * Photo grouping and date formatting for the gallery.
 *
 * Deliberately duplicated from `photos.ts` in @pulse/shared rather than
 * imported: shared is type-only on mobile (a value import fails under Metro),
 * so the few lines live here and are covered by their own test. Keep the two
 * in step — the ordering rule especially, since the grid and the API must agree
 * on what "newest first" means.
 */
/** Mirrors PhotoAudience; shared is not resolvable from mobile at runtime. */
export type PhotoAudience = "NONE" | "TRAINER" | "PRACTITIONER";

const MONTHS_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08-28" → "28 AUG", the Doto date on a tile. */
export function tilePhotoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const month = MONTHS_SHORT[Number(m[2]) - 1];
  if (!month) return "";
  return `${m[3]} ${month}`;
}

/** "2026-08-28" → "August 2026", the month heading in the grid. */
export function photoMonthHeading(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const month = MONTHS_LONG[Number(m[2]) - 1];
  if (!month) return "";
  return `${month} ${m[1]}`;
}

/** "2026-08-28" → "28 August 2026", the long date on the detail view. */
export function fullPhotoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const month = MONTHS_LONG[Number(m[2]) - 1];
  if (!month) return "";
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/**
 * Whether the thumbnail carries the lock chip: this photo's visibility differs
 * from the gallery-wide default, so the chip means "this one is different"
 * rather than decorating every tile.
 */
export function photoHasOverride(
  override: PhotoAudience | null,
  galleryDefault: PhotoAudience,
): boolean {
  return override !== null && override !== galleryDefault;
}

/** Group photos into the dated sections the grid renders, newest first. */
export function groupPhotosByMonth<T extends { takenOn: string }>(
  photos: T[],
): { heading: string; photos: T[] }[] {
  const out: { heading: string; photos: T[] }[] = [];
  for (const photo of [...photos].sort((a, b) => b.takenOn.localeCompare(a.takenOn))) {
    const heading = photoMonthHeading(photo.takenOn);
    const last = out[out.length - 1];
    if (last && last.heading === heading) last.photos.push(photo);
    else out.push({ heading, photos: [photo] });
  }
  return out;
}

/** Today as device-local YYYY-MM-DD — the default "taken on" for a new photo. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
