import { describe, it, expect } from "vitest";
import { CONSENT_ORDER, mergeConsents, sharedWith, sharesAnything, type ConsentRow } from "../index";

describe("mergeConsents", () => {
  it("defaults every category to NONE when nothing is stored", () => {
    const rows = mergeConsents([]);
    expect(rows).toHaveLength(CONSENT_ORDER.length);
    expect(rows.every((r) => r.audience === "NONE")).toBe(true);
  });

  it("fills untouched categories with NONE — a missing row is never permission", () => {
    const rows = mergeConsents([{ category: "ACTIVITY", audience: "TRAINER" }]);
    expect(rows.find((r) => r.category === "ACTIVITY")!.audience).toBe("TRAINER");
    expect(rows.find((r) => r.category === "BIOMETRICS")!.audience).toBe("NONE");
    expect(rows.find((r) => r.category === "DIAGNOSTICS")!.audience).toBe("NONE");
  });

  it("returns categories in display order", () => {
    const rows = mergeConsents([{ category: "PHOTOS", audience: "PRACTITIONER" }]);
    expect(rows.map((r) => r.category)).toEqual(CONSENT_ORDER);
  });
});

describe("sharedWith", () => {
  const rows: ConsentRow[] = [
    { category: "BIOMETRICS", audience: "PRACTITIONER" },
    { category: "ACTIVITY", audience: "TRAINER" },
    { category: "JOURNAL", audience: "NONE" },
    { category: "DIAGNOSTICS", audience: "PRACTITIONER" },
    { category: "PHOTOS", audience: "NONE" },
  ];

  it("gives an audience only what was granted to it", () => {
    expect(sharedWith(rows, "TRAINER")).toEqual(["ACTIVITY"]);
    expect(sharedWith(rows, "PRACTITIONER")).toEqual(["BIOMETRICS", "DIAGNOSTICS"]);
  });

  it("never leaks anything to NONE", () => {
    expect(sharedWith(rows, "NONE")).toEqual([]);
  });

  it("returns nothing when everything is private", () => {
    const priv = mergeConsents([]);
    expect(sharedWith(priv, "TRAINER")).toEqual([]);
    expect(sharedWith(priv, "PRACTITIONER")).toEqual([]);
  });
});

describe("sharesAnything", () => {
  it("is false for a fully private user", () => {
    expect(sharesAnything(mergeConsents([]))).toBe(false);
  });

  it("is true once any category is shared", () => {
    expect(sharesAnything(mergeConsents([{ category: "ACTIVITY", audience: "TRAINER" }]))).toBe(true);
  });
});
