/**
 * Converters between the client's device-local YYYY-MM-DD strings and the
 * UTC-midnight Date values Prisma stores in `@db.Date` columns. Shared by every
 * router that touches DailyLog.
 */

/** A bare YYYY-MM-DD string → a Date at UTC midnight for the `@db.Date` column. */
export function toDbDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

/** A `@db.Date` value (UTC-midnight Date) → its YYYY-MM-DD string. */
export function fromDbDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
