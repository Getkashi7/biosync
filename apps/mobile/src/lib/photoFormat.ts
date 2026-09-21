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
 * Whole weeks between two `YYYY-MM-DD` dates, for the compare view's readout.
 *
 * Parsed as UTC on both sides so the answer cannot change with the reader's
 * timezone, and rounded rather than floored: 76 days is much nearer eleven
 * weeks than ten, and the number sits under the words "weeks apart" where
 * "about" is already implied. Order does not matter.
 */
export function weeksApart(a: string, b: string): number | null {
  const at = Date.parse(`${a}T00:00:00.000Z`);
  const bt = Date.parse(`${b}T00:00:00.000Z`);
  if (Number.isNaN(at) || Number.isNaN(bt)) return null;
  return Math.round(Math.abs(at - bt) / (7 * 86_400_000));
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

/**
 * The effective audience of one photo — mirrors `effectivePhotoAudience` in
 * `@pulse/shared`'s `photos.ts`, which is the rule the API actually enforces.
 *
 * An override may **narrow** and never widen. Anything other than "hidden" or
 * the category's own audience resolves to hidden, so a photo can never be more
 * visible than the Photos consent allows.
 */
export function effectiveAudience(
  override: PhotoAudience | null,
  category: PhotoAudience,
): PhotoAudience {
  if (category === "NONE") return "NONE";
  if (override === null) return category;
  if (override === "NONE") return "NONE";
  return override === category ? override : "NONE";
}

/**
 * Whether offering this audience on a single photo can do anything at all.
 *
 * The direct consequence of the rule above: only "hidden" and the gallery's own
 * default have an effect. The photo sheet greys out the rest, because it used
 * to offer all three and then claim the pick had "overridden your default" when
 * the server would resolve it to hidden and no trainer would ever see it.
 */
export function audienceReachable(
  value: PhotoAudience,
  galleryDefault: PhotoAudience,
): boolean {
  return effectiveAudience(value, galleryDefault) === value;
}
