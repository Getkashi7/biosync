/**
 * Classes, bookings and check-ins.
 *
 * The assertions that carry weight: nothing can write `ATTENDED` except a
 * check-in, a token one window outside the skew is not accepted, and a scan
 * with no booking never invents one. Each is a rule about what the app is
 * allowed to claim happened to a person.
 */
import { describe, it, expect } from "vitest";
import {
  CHECKIN_TOKEN_PREFIX,
  CHECKIN_WINDOW_SECONDS,
  CHECKIN_WINDOW_SKEW,
  MAX_SCHEDULE_DAYS,
  MAX_WINDOW_DAYS,
  bookingStatus,
  buildCheckInToken,
  canBook,
  canCancelBooking,
  canTransitionBooking,
  checkInWindow,
  classForCheckIn,
  classState,
  dayWindow,
  expectedCheckInPayloads,
  parseCheckInToken,
  scheduleInput,
  seatsLeft,
  type BookingActor,
  type BookingStatus,
  type ClassView,
} from "../gym";

const NOW = new Date("2026-09-16T18:00:00.000Z");
const cls = (over: Partial<ClassView> = {}): ClassView => ({
  status: "SCHEDULED",
  startsAt: new Date("2026-09-16T19:00:00.000Z"),
  durationMin: 60,
  capacity: 10,
  seatsTaken: 0,
  ...over,
});

describe("the booking transition table", () => {
  const STATUSES = bookingStatus.options as BookingStatus[];
  const ACTORS: BookingActor[] = ["MEMBER", "STAFF", "SYSTEM"];

  const ALLOWED = new Set([
    "BOOKED>CANCELLED>MEMBER",
    "BOOKED>CANCELLED>STAFF",
    "BOOKED>ATTENDED>SYSTEM",
    "BOOKED>NO_SHOW>STAFF",
    "CANCELLED>BOOKED>MEMBER",
  ]);

  it("permits exactly five transitions out of every combination", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        for (const actor of ACTORS) {
          const key = `${from}>${to}>${actor}`;
          expect(canTransitionBooking(from, to, actor), key).toBe(ALLOWED.has(key));
        }
      }
    }
  });

  /**
   * The one that matters. Attendance is a fact about a body being in a room —
   * it is produced by a check-in or it is not true, and neither a member nor a
   * staff member may simply assert it.
   */
  it("lets nothing but a check-in write ATTENDED", () => {
    for (const from of STATUSES) {
      expect(canTransitionBooking(from, "ATTENDED", "MEMBER"), from).toBe(false);
      expect(canTransitionBooking(from, "ATTENDED", "STAFF"), from).toBe(false);
    }
    expect(canTransitionBooking("BOOKED", "ATTENDED", "SYSTEM")).toBe(true);
  });

  it("allows nothing at all out of ATTENDED or NO_SHOW", () => {
    for (const from of ["ATTENDED", "NO_SHOW"] as BookingStatus[]) {
      for (const to of STATUSES) {
        for (const actor of ACTORS) {
          expect(canTransitionBooking(from, to, actor), `${from}>${to}>${actor}`).toBe(false);
        }
      }
    }
  });

  it("lets a member change their mind back", () => {
    expect(canTransitionBooking("CANCELLED", "BOOKED", "MEMBER")).toBe(true);
    expect(canTransitionBooking("CANCELLED", "BOOKED", "STAFF")).toBe(false);
  });
});

describe("classState", () => {
  it("is open with seats and time to spare", () => {
    expect(classState(cls(), NOW)).toBe("OPEN");
    expect(canBook(cls(), NOW)).toBe(true);
  });

  it("is full at capacity, and seatsLeft never goes negative", () => {
    expect(classState(cls({ seatsTaken: 10 }), NOW)).toBe("FULL");
    expect(canBook(cls({ seatsTaken: 10 }), NOW)).toBe(false);
    // Even if the counter has drifted above capacity.
    expect(seatsLeft({ capacity: 10, seatsTaken: 12 })).toBe(0);
  });

  it("is cancelled whatever else is true", () => {
    expect(classState(cls({ status: "CANCELLED", seatsTaken: 0 }), NOW)).toBe("CANCELLED");
  });

  // A class under way is not "full" — the reason you cannot book it is that it
  // has started, and the screen should say so.
  it("distinguishes in-progress from past, and neither is bookable", () => {
    const start = new Date("2026-09-16T19:00:00.000Z");
    expect(classState(cls(), new Date(start.getTime() + 10 * 60_000))).toBe("IN_PROGRESS");
    expect(classState(cls(), new Date(start.getTime() + 61 * 60_000))).toBe("PAST");
    expect(canBook(cls(), new Date(start.getTime() + 10 * 60_000))).toBe(false);
  });

  it("lets a member cancel until it starts, and not after", () => {
    const start = new Date("2026-09-16T19:00:00.000Z");
    expect(canCancelBooking(cls(), NOW)).toBe(true);
    expect(canCancelBooking(cls(), start)).toBe(false);
    expect(canCancelBooking(cls({ status: "CANCELLED" }), NOW)).toBe(false);
  });
});

describe("check-in tokens", () => {
  const VENUE = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  const nowSec = Math.floor(NOW.getTime() / 1000);

  it("round-trips through a caller-supplied signer", () => {
    const token = buildCheckInToken(VENUE, checkInWindow(nowSec), () => "abc123");
    const parsed = parseCheckInToken(token);
    expect(parsed?.venueId).toBe(VENUE);
    expect(parsed?.mac).toBe("abc123");
    expect(token.startsWith(CHECKIN_TOKEN_PREFIX)).toBe(true);
  });

  it("rejects anything that is not one of ours", () => {
    for (const bad of ["", "nope", "A:B:C:D", `${CHECKIN_TOKEN_PREFIX}:v:notanumber:mac`, `${CHECKIN_TOKEN_PREFIX}:v:1`, "x".repeat(300)]) {
      expect(parseCheckInToken(bad), bad.slice(0, 20)).toBeNull();
    }
  });

  it("accepts exactly the windows inside the skew", () => {
    const payloads = expectedCheckInPayloads(VENUE, nowSec);
    expect(payloads).toHaveLength(CHECKIN_WINDOW_SKEW * 2 + 1);
    const w = checkInWindow(nowSec);
    expect(payloads).toContain(`${VENUE}:${w}`);
    expect(payloads).toContain(`${VENUE}:${w - 1}`);
    expect(payloads).toContain(`${VENUE}:${w + 1}`);
  });

  /**
   * The replay bound. A token accepted for ten minutes is a screenshot someone
   * can use from the car park, so the set must not quietly widen.
   */
  it("does not accept a window beyond the skew", () => {
    const payloads = expectedCheckInPayloads(VENUE, nowSec);
    const w = checkInWindow(nowSec);
    expect(payloads).not.toContain(`${VENUE}:${w + CHECKIN_WINDOW_SKEW + 1}`);
    expect(payloads).not.toContain(`${VENUE}:${w - CHECKIN_WINDOW_SKEW - 1}`);
  });

  it("rotates every minute", () => {
    expect(checkInWindow(nowSec + CHECKIN_WINDOW_SECONDS)).toBe(checkInWindow(nowSec) + 1);
  });
});

describe("classForCheckIn", () => {
  const at = (iso: string) => ({ id: iso, startsAt: new Date(iso), durationMin: 60 });

  it("matches a class about to start", () => {
    const c = at("2026-09-16T18:15:00.000Z");
    expect(classForCheckIn([c], NOW)?.id).toBe(c.id);
  });

  /**
   * Returning null is the correct, common answer. A scan with no booked class
   * is still a real visit — the person was there — and must never attach itself
   * to a booking that does not exist.
   */
  it("returns null rather than reaching for a class that is hours away", () => {
    expect(classForCheckIn([at("2026-09-16T23:00:00.000Z")], NOW)).toBeNull();
    expect(classForCheckIn([], NOW)).toBeNull();
  });

  it("refuses a class that started too long ago", () => {
    expect(classForCheckIn([at("2026-09-16T17:00:00.000Z")], NOW)).toBeNull();
  });

  it("picks the nearest start when two are close", () => {
    const near = at("2026-09-16T18:05:00.000Z");
    const far = at("2026-09-16T18:25:00.000Z");
    expect(classForCheckIn([far, near], NOW)?.id).toBe(near.id);
  });
});

describe("dayWindow", () => {
  it("spans whole days from the given date", () => {
    const w = dayWindow("2026-09-16", 2);
    expect(w.gte.toISOString()).toBe("2026-09-16T00:00:00.000Z");
    expect(w.lt.toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  // The offset is injected because shared never touches Intl — the API derives
  // it from the venue's timezone.
  it("shifts by the offset it is handed", () => {
    const w = dayWindow("2026-09-16", 1, 60);
    expect(w.gte.toISOString()).toBe("2026-09-15T23:00:00.000Z");
  });

  it("clamps an absurd span rather than querying a decade", () => {
    const w = dayWindow("2026-09-16", 9999);
    const days = (w.lt.getTime() - w.gte.getTime()) / 86_400_000;
    expect(days).toBe(MAX_WINDOW_DAYS);
  });

  /**
   * The regression that sent this file looking. The timeline is validated up to
   * 60 days and asks for 30; clamping it to the *schedule's* 14 turned "the
   * last 30 days" into a fortnight that ended sixteen days ago, so a check-in
   * made today was never in range. A span a caller is allowed to ask for must
   * come back whole.
   */
  it("gives a 30-day caller 30 whole days", () => {
    const w = dayWindow("2026-08-22", 30);
    const days = (w.lt.getTime() - w.gte.getTime()) / 86_400_000;
    expect(days).toBe(30);
    expect(w.lt.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("still holds the schedule to its own 14 via its input schema", () => {
    expect(MAX_SCHEDULE_DAYS).toBe(14);
    const venueId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(scheduleInput.parse({ venueId, from: "2026-09-16" }).days).toBe(7);
    expect(() => scheduleInput.parse({ venueId, from: "2026-09-16", days: 30 })).toThrow();
  });
});
