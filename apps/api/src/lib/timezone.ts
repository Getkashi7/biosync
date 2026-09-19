/**
 * Turning an IANA zone into a UTC offset — the half `@pulse/shared` refuses.
 *
 * `dayWindow` takes an offset in minutes rather than a zone name because shared
 * never touches `Intl`, exactly as it never touches crypto: both are host
 * capabilities, and a pure module that quietly depends on one is a module whose
 * tests pass everywhere and whose behaviour differs by runtime.
 *
 * The offset is computed **at a given instant**, never cached, because the
 * answer changes twice a year. Asking "what is Europe/London's offset" with no
 * date is a question with two answers.
 */

/** Used when no venue narrows the query — the zone the gym actually is in. */
export const DEFAULT_TIMEZONE = "Europe/London";

/**
 * Minutes that `timeZone` is ahead of UTC at `at`. London in summer is +60.
 *
 * An unknown zone returns 0 rather than throwing: a schedule shifted by an hour
 * is a nuisance, a 500 on the schedule screen is an outage, and a bad zone
 * string is a data problem to fix rather than a request to fail.
 */
export function zoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
  } catch {
    return 0;
  }

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };

  // The same instant, read as a wall clock in that zone, then re-asserted as
  // UTC. The gap between the two IS the offset.
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  // Seconds are whole in every zone in use; rounding guards against the format
  // dropping sub-minute precision rather than against real fractional zones.
  return Math.round((asIfUtc - at.getTime()) / 60_000);
}
