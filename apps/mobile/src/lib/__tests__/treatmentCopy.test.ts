/**
 * §7 copy. The disclaimer is a regulatory requirement rather than a caption, so
 * it is asserted here as a literal — and `packages/shared` carries a companion
 * test that reads THIS file from disk and fails if the two ever drift, which is
 * the only cross-check available while mobile cannot import shared.
 */
import { describe, it, expect } from "vitest";
import {
  TREATMENT_DISCLAIMER,
  TREATMENT_PENDING_NOTE,
  TREATMENT_QUEUE_DISCLAIMER,
  TREATMENT_QUEUE_LEAD,
  MIN_DECLINE_REASON,
  relativeDay,
  CLINIC_BOOKING_URL,
  canOpenClinic,
  bookingNote,
  canWithdraw,
  statusBody,
  statusLabel,
  statusTone,
  type TreatmentStatus,
} from "../treatmentCopy";

const ALL: TreatmentStatus[] = ["REQUESTED", "APPROVED", "DECLINED", "WITHDRAWN", "EXPIRED"];

describe("the disclaimer", () => {
  it("is the exact sentence the API exports", () => {
    expect(TREATMENT_DISCLAIMER).toBe(
      "Wellness suggestion only. The Biomeds doctor will review your booking.",
    );
  });

  it("keeps saying nothing is booked, once a request exists", () => {
    expect(TREATMENT_PENDING_NOTE.toLowerCase()).toContain("nothing is booked");
  });
});

describe("status presentation", () => {
  it("has a label and a body for every status", () => {
    for (const s of ALL) {
      expect(statusLabel(s).length).toBeGreaterThan(0);
      expect(statusBody(s, null).length).toBeGreaterThan(0);
    }
  });

  /**
   * The confusion this feature cannot afford. "Pending" is what a booking says;
   * this is a question nobody has answered yet.
   */
  it("never calls an undecided request pending, or booked", () => {
    expect(statusLabel("REQUESTED")).toBe("Awaiting review");
    expect(statusBody("REQUESTED", null).toLowerCase()).toContain("nothing is booked");
  });

  it("never implies an appointment exists, in any status", () => {
    for (const s of ALL) {
      const text = `${statusLabel(s)} ${statusBody(s, 5)}`.toLowerCase();
      expect(text, s).not.toContain("booked for");
      expect(text, s).not.toContain("your appointment");
      expect(text, s).not.toContain("scheduled");
    }
  });

  it("counts down an approval, and says so plainly on the last day", () => {
    expect(statusBody("APPROVED", 12)).toContain("lapses in 12 days");
    expect(statusBody("APPROVED", 1)).toContain("lapses today");
    expect(statusBody("APPROVED", 0)).toContain("lapses today");
  });

  it("tells the user an expired approval can be asked for again", () => {
    expect(statusBody("EXPIRED", null).toLowerCase()).toContain("ask again");
  });

  it("tones pending, approved and closed apart", () => {
    expect(statusTone("REQUESTED")).toBe("pending");
    expect(statusTone("APPROVED")).toBe("approved");
    for (const s of ["DECLINED", "WITHDRAWN", "EXPIRED"] as TreatmentStatus[]) {
      expect(statusTone(s)).toBe("closed");
    }
  });
});

describe("canWithdraw mirrors the server's transition table", () => {
  it("offers withdraw only while the request is open", () => {
    expect(canWithdraw("REQUESTED")).toBe(true);
    // permission is not obligation — a client may still back out after approval
    expect(canWithdraw("APPROVED")).toBe(true);
    expect(canWithdraw("DECLINED")).toBe(false);
    expect(canWithdraw("WITHDRAWN")).toBe(false);
    expect(canWithdraw("EXPIRED")).toBe(false);
  });
});

describe("queue copy", () => {
  it("states what the service is and that the decision is recorded", () => {
    expect(TREATMENT_QUEUE_DISCLAIMER).toContain("not medical treatment, diagnosis or advice");
    expect(TREATMENT_QUEUE_DISCLAIMER.toLowerCase()).toContain("logged");
  });

  it("tells the practitioner a decline needs a reason the client will read", () => {
    expect(TREATMENT_QUEUE_LEAD.toLowerCase()).toContain("reason");
    expect(TREATMENT_QUEUE_LEAD.toLowerCase()).toContain("shared with the client");
  });

  it("mirrors the server's decline minimum", () => {
    expect(MIN_DECLINE_REASON).toBe(10);
  });
});

describe("relativeDay", () => {
  const at = (iso: string) => new Date(iso);
  const NOW = at("2026-09-09T12:00:00.000Z");

  it("reads relative while that is unambiguous", () => {
    expect(relativeDay(at("2026-09-09T11:15:00.000Z"), NOW)).toBe("45m ago");
    expect(relativeDay(at("2026-09-09T10:00:00.000Z"), NOW)).toBe("2h ago");
    expect(relativeDay(at("2026-09-08T20:00:00.000Z"), NOW)).toBe("16h ago");
    expect(relativeDay(at("2026-09-08T06:00:00.000Z"), NOW)).toBe("yesterday");
  });

  // Past two days, "3d ago" makes a practitioner do arithmetic to work out
  // whether a request has been sitting over a weekend. The queue is exactly
  // where that matters, so it becomes a date.
  it("becomes a date once relative stops being useful", () => {
    expect(relativeDay(at("2026-09-06T09:00:00.000Z"), NOW)).toBe("6 Sep");
    expect(relativeDay(at("2026-08-30T09:00:00.000Z"), NOW)).toBe("30 Aug");
  });

  it("never renders a negative age from a clock skew", () => {
    expect(relativeDay(at("2026-09-09T12:05:00.000Z"), NOW)).toBe("just now");
    expect(relativeDay(NOW, NOW)).toBe("just now");
  });
});

describe("the clinic hand-off", () => {
  // The order is the regulatory point: a booking must be unreachable until a
  // clinician has looked at the request. `canBook` is the server's
  // canProceedToBooking, which is false for a lapsed approval too.
  it("never offers a booking before approval", () => {
    expect(canOpenClinic(false)).toBe(false);
    expect(bookingNote(false)).toBe("");
  });

  // Unset in most builds, and a button that goes nowhere is worse than none.
  it("hides the button when no clinic is configured, and still says something true", () => {
    if (CLINIC_BOOKING_URL.length === 0) {
      expect(canOpenClinic(true)).toBe(false);
      expect(bookingNote(true)).toBe(
        "The Biomeds doctor will arrange the appointment with you directly.",
      );
    } else {
      expect(canOpenClinic(true)).toBe(true);
      expect(bookingNote(true).toLowerCase()).toContain("clinic");
    }
  });

  it("never claims BIOSYNC does the booking", () => {
    for (const note of [bookingNote(true), bookingNote(false)]) {
      expect(note.toLowerCase()).not.toMatch(/we('| ha)ve booked|your appointment is/);
    }
  });
});
