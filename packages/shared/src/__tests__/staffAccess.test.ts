import { describe, it, expect } from "vitest";
import { mergeConsents, staffCanSee, staffVisibleCategories, type ConsentRow } from "../index";

/** everything shared with the trainer */
const allToTrainer: ConsentRow[] = mergeConsents([
  { category: "BIOMETRICS", audience: "TRAINER" },
  { category: "JOURNAL", audience: "TRAINER" },
  { category: "DIAGNOSTICS", audience: "TRAINER" },
  { category: "PHOTOS", audience: "TRAINER" },
  { category: "ACTIVITY", audience: "TRAINER" },
]);

/** everything shared with the practitioner */
const allToPractitioner: ConsentRow[] = mergeConsents([
  { category: "BIOMETRICS", audience: "PRACTITIONER" },
  { category: "JOURNAL", audience: "PRACTITIONER" },
  { category: "DIAGNOSTICS", audience: "PRACTITIONER" },
  { category: "PHOTOS", audience: "PRACTITIONER" },
  { category: "ACTIVITY", audience: "PRACTITIONER" },
]);

describe("staffVisibleCategories", () => {
  it("gives a fully private user's staff nothing", () => {
    const priv = mergeConsents([]);
    expect(staffVisibleCategories(priv, "PT")).toEqual([]);
    expect(staffVisibleCategories(priv, "PRACTITIONER")).toEqual([]);
  });

  it("caps a trainer at activity + photos even when the user shares everything", () => {
    const visible = staffVisibleCategories(allToTrainer, "PT");
    expect(visible).toContain("ACTIVITY");
    expect(visible).toContain("PHOTOS");
    // the promise made on the role explainer screen
    expect(visible).not.toContain("BIOMETRICS");
    expect(visible).not.toContain("DIAGNOSTICS");
    expect(visible).not.toContain("JOURNAL");
  });

  it("lets a practitioner see health data, but only what was shared", () => {
    expect(staffVisibleCategories(allToPractitioner, "PRACTITIONER")).toEqual([
      "BIOMETRICS",
      "JOURNAL",
      "DIAGNOSTICS",
      "PHOTOS",
      "ACTIVITY",
    ]);
  });

  it("does not let one role read what was shared with the other", () => {
    // shared with the practitioner only — the trainer still sees nothing
    expect(staffVisibleCategories(allToPractitioner, "PT")).toEqual([]);
    // shared with the trainer only — the practitioner sees nothing
    expect(staffVisibleCategories(allToTrainer, "PRACTITIONER")).toEqual([]);
  });

  it("respects a partial grant", () => {
    const rows = mergeConsents([{ category: "ACTIVITY", audience: "TRAINER" }]);
    expect(staffVisibleCategories(rows, "PT")).toEqual(["ACTIVITY"]);
  });

  it("treats revoking back to No one as immediate removal", () => {
    const revoked = mergeConsents([{ category: "ACTIVITY", audience: "NONE" }]);
    expect(staffVisibleCategories(revoked, "PT")).toEqual([]);
  });
});

describe("staffCanSee", () => {
  it("answers per category", () => {
    expect(staffCanSee(allToTrainer, "PT", "ACTIVITY")).toBe(true);
    expect(staffCanSee(allToTrainer, "PT", "BIOMETRICS")).toBe(false);
    expect(staffCanSee(allToPractitioner, "PRACTITIONER", "DIAGNOSTICS")).toBe(true);
  });
});
