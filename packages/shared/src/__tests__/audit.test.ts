import { describe, it, expect } from "vitest";
import { AUDIT, AUDIT_LABELS, auditLabel, sanitiseAuditMeta } from "../index";

describe("AUDIT actions", () => {
  it("keeps stable string values (the trail is append-only)", () => {
    expect(AUDIT.mealLogged).toBe("meal.logged");
    expect(AUDIT.supplementAdded).toBe("supplement.added");
    expect(AUDIT.accountDeleted).toBe("account.deleted");
  });
});

describe("sanitiseAuditMeta", () => {
  it("returns null for nothing", () => {
    expect(sanitiseAuditMeta(null)).toBeNull();
    expect(sanitiseAuditMeta(undefined)).toBeNull();
    expect(sanitiseAuditMeta({})).toBeNull();
  });

  it("keeps safe scalars", () => {
    expect(sanitiseAuditMeta({ source: "mobile", count: 3, estimated: true })).toEqual({
      source: "mobile",
      count: 3,
      estimated: true,
    });
  });

  it("drops health-bearing keys", () => {
    const meta = {
      source: "mobile",
      calories: 820,
      proteinG: 42,
      weightKg: 70,
      glucose: 5.4,
      restingHr: 58,
      sleepHours: 7.2,
      readinessScore: 82,
      dose: "2000 IU",
    };
    expect(sanitiseAuditMeta(meta)).toEqual({ source: "mobile" });
  });

  it("catches health keys regardless of casing or wrapping", () => {
    expect(sanitiseAuditMeta({ CALORIES: 800, total_fat_g: 20, myHRVreading: 60 })).toBeNull();
  });

  it("drops free text long enough to hide a health detail", () => {
    const long = "x".repeat(65);
    expect(sanitiseAuditMeta({ tag: long })).toBeNull();
    expect(sanitiseAuditMeta({ tag: "short" })).toEqual({ tag: "short" });
  });

  it("drops nested structures entirely", () => {
    expect(sanitiseAuditMeta({ nested: { calories: 800 }, list: [1, 2, 3], ok: 1 })).toEqual({ ok: 1 });
  });

  it("drops non-finite numbers", () => {
    expect(sanitiseAuditMeta({ a: Number.NaN, b: Number.POSITIVE_INFINITY, c: 2 })).toEqual({ c: 2 });
  });

  it("drops the free-text keys that commonly carry health detail", () => {
    expect(sanitiseAuditMeta({ note: "felt dizzy today", description: "2 eggs", name: "Zinc" })).toEqual({
      name: "Zinc",
    });
  });
});

describe("audit labels", () => {
  // The Record<AuditAction, string> type catches a missing key at compile time;
  // this catches a STALE one after an action string is renamed, which the type
  // cannot see.
  it("labels every action in the vocabulary", () => {
    for (const action of Object.values(AUDIT)) {
      expect(AUDIT_LABELS[action], action).toBeTruthy();
    }
    expect(Object.keys(AUDIT_LABELS).sort()).toEqual([...Object.values(AUDIT)].sort());
  });

  /**
   * The trail is append-only: a row written by a version that knew an action
   * this one doesn't is normal, and showing the stored string beats showing
   * nothing. Same posture as `protocolName()` for a retired treatment slug.
   */
  it("degrades to the raw string rather than throwing", () => {
    expect(auditLabel("some.action.from.2029")).toBe("some.action.from.2029");
    expect(auditLabel("")).toBe("");
  });

  it("reads as a sentence about a person, not a database event", () => {
    expect(auditLabel(AUDIT.staffViewedClient)).toBe("Viewed a client");
    expect(auditLabel(AUDIT.treatmentApproved)).toBe("Approved a treatment review");
    for (const label of Object.values(AUDIT_LABELS)) {
      expect(label).not.toMatch(/_|\./);
    }
  });
});
