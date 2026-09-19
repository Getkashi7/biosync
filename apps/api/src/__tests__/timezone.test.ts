/**
 * The offset `@pulse/shared` refuses to compute.
 *
 * `dayWindow` takes minutes rather than a zone name because shared never
 * touches `Intl` — so this is the module that does, and the thing worth pinning
 * is that the answer depends on *when* you ask. "What is Europe/London's
 * offset" has two answers a year apart, and a cached one puts every evening
 * class on the wrong day for six months.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_TIMEZONE, zoneOffsetMinutes } from "../lib/timezone";

describe("zoneOffsetMinutes", () => {
  it("moves with British Summer Time rather than being fixed", () => {
    expect(zoneOffsetMinutes("Europe/London", new Date("2026-01-15T12:00:00Z"))).toBe(0);
    expect(zoneOffsetMinutes("Europe/London", new Date("2026-07-15T12:00:00Z"))).toBe(60);
  });

  it("handles zones on the other side of UTC, and half-hour ones", () => {
    expect(zoneOffsetMinutes("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe(-300);
    expect(zoneOffsetMinutes("Asia/Kolkata", new Date("2026-01-15T12:00:00Z"))).toBe(330);
  });

  it("is zero for UTC itself", () => {
    expect(zoneOffsetMinutes("UTC", new Date("2026-07-15T12:00:00Z"))).toBe(0);
  });

  /**
   * A bad zone string in a venue row is a data problem to fix. Failing the
   * whole schedule read over it would turn that into an outage, so the schedule
   * is an hour out instead and stays readable.
   */
  it("falls back to UTC rather than throwing on a zone it does not know", () => {
    expect(zoneOffsetMinutes("Mars/Olympus_Mons", new Date("2026-07-15T12:00:00Z"))).toBe(0);
    expect(zoneOffsetMinutes("", new Date("2026-07-15T12:00:00Z"))).toBe(0);
  });

  it("names a real zone as the default", () => {
    expect(() => new Intl.DateTimeFormat("en-GB", { timeZone: DEFAULT_TIMEZONE })).not.toThrow();
  });
});
