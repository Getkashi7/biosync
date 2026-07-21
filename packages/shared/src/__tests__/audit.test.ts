import { describe, it, expect } from "vitest";
import { AUDIT, sanitiseAuditMeta } from "../index";

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
