/**
 * Small display formatters shared by the feature screens.
 *
 * Deliberately hand-rolled rather than `toLocaleString` / `Intl`: Hermes on
 * Android ships a trimmed ICU, so locale grouping and date formatting can't be
 * relied on to produce the same output across devices.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date → "Mon · Jul 20". Defaults to today. */
export function dateLabel(d: Date = new Date()): string {
  return `${WEEKDAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** A date → "Jul". Uppercase it at the call site if the design wants caps. */
export function monthShort(d: Date): string {
  return MONTHS[d.getMonth()] ?? "";
}

/** A date → "Jul 2026". */
export function monthYear(d: Date): string {
  return `${monthShort(d)} ${d.getFullYear()}`;
}

/** "Priya Nair" → "PN". Falls back to the first character for a single word. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Whole days between two dates, ignoring clock time. */
export function dayDiff(a: Date, b: Date): number {
  const ms =
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round(ms / 86_400_000);
}

/** 1840 → "1,840". Rounds first; negatives keep their sign. */
export function groupThousands(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * ISO week string for a date, e.g. "2026-W30" — the key the API stores plans
 * under. Mirrors `isoWeek` in @pulse/shared; duplicated here because the mobile
 * client consumes that package type-only and can't import its runtime code.
 */
export function isoWeekOf(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The week number out of an ISO week string ("2026-W30" → 30). */
export function weekNumber(isoWeekString: string): number {
  return Number(isoWeekString.slice(-2));
}

/** An instant → device-local "18:40". */
export function clockTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
