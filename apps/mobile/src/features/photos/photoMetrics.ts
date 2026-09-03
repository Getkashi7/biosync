/**
 * The weight recorded on a photo's day, for the detail view and the compare
 * delta.
 *
 * Read from the existing metrics rather than stored on the photo: duplicating
 * it would let the two drift, and a weight corrected later should correct the
 * photo's caption too. Returns null when nothing was logged that day — the
 * caption is then omitted rather than showing a zero or the nearest reading,
 * which would attribute a number to a day it doesn't belong to.
 */
import { trpc } from "../../lib/trpc";

/** The day's bounds in the device's own timezone, as instants. */
function dayBounds(iso: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const start = new Date(y, mo, d, 0, 0, 0, 0);
  const end = new Date(y, mo, d, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Weight in kg logged on that local day, or null. */
export async function fetchWeightOn(takenOn: string): Promise<number | null> {
  const bounds = dayBounds(takenOn);
  if (!bounds) return null;
  const rows = await trpc.metrics.list.query(bounds);
  // Newest first from the API; the last reading of the day is the one to show.
  const weight = rows.find((r) => r.type === "WEIGHT");
  return weight ? weight.value : null;
}
