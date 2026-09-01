import { describe, expect, it } from "vitest";
import {
  effectivePhotoAudience,
  groupByMonth,
  hasVisibilityOverride,
  monthHeading,
  photoUploadInput,
  photoVisibilityInput,
  tileDate,
} from "../photos";

describe("effectivePhotoAudience", () => {
  it("follows the category consent when there is no override", () => {
    expect(effectivePhotoAudience(null, "TRAINER")).toBe("TRAINER");
    expect(effectivePhotoAudience(null, "PRACTITIONER")).toBe("PRACTITIONER");
    expect(effectivePhotoAudience(null, "NONE")).toBe("NONE");
  });

  // The whole point of the override: one photo held back from a gallery that
  // is otherwise shared.
  it("lets an override make a single photo private", () => {
    expect(effectivePhotoAudience("NONE", "TRAINER")).toBe("NONE");
    expect(effectivePhotoAudience("NONE", "PRACTITIONER")).toBe("NONE");
  });

  it("never widens past the category consent", () => {
    // Nothing is consented, so no per-photo setting can share anything.
    expect(effectivePhotoAudience("TRAINER", "NONE")).toBe("NONE");
    expect(effectivePhotoAudience("PRACTITIONER", "NONE")).toBe("NONE");
  });

  // "My practitioner" while only a trainer is consented must not quietly fall
  // back to showing the trainer — that would share a photo with the one person
  // the user just tried to exclude.
  it("resolves a mismatched override to NONE rather than to either party", () => {
    expect(effectivePhotoAudience("PRACTITIONER", "TRAINER")).toBe("NONE");
    expect(effectivePhotoAudience("TRAINER", "PRACTITIONER")).toBe("NONE");
  });

  it("keeps an override that agrees with the category consent", () => {
    expect(effectivePhotoAudience("TRAINER", "TRAINER")).toBe("TRAINER");
    expect(effectivePhotoAudience("PRACTITIONER", "PRACTITIONER")).toBe("PRACTITIONER");
  });
});

describe("hasVisibilityOverride", () => {
  it("marks a photo whose visibility differs from the gallery default", () => {
    expect(hasVisibilityOverride("NONE", "TRAINER")).toBe(true);
    expect(hasVisibilityOverride("PRACTITIONER", "TRAINER")).toBe(true);
  });

  it("does not mark a photo that matches the default", () => {
    expect(hasVisibilityOverride(null, "TRAINER")).toBe(false);
    expect(hasVisibilityOverride("TRAINER", "TRAINER")).toBe(false);
  });
});

describe("date formatting", () => {
  it("renders the Doto tile date", () => {
    expect(tileDate("2026-08-28")).toBe("28 AUG");
    expect(tileDate("2026-01-01")).toBe("01 JAN");
    expect(tileDate("2026-12-31")).toBe("31 DEC");
  });

  it("renders the month heading", () => {
    expect(monthHeading("2026-08-28")).toBe("August 2026");
  });

  it("returns empty string for a malformed date rather than throwing", () => {
    for (const bad of ["", "2026-8-28", "not-a-date", "2026-13-01"]) {
      expect(tileDate(bad)).toBe("");
    }
  });
});

describe("groupByMonth", () => {
  it("groups newest first, within and across months", () => {
    const groups = groupByMonth([
      { takenOn: "2026-07-04" },
      { takenOn: "2026-08-28" },
      { takenOn: "2026-08-02" },
    ]);
    expect(groups.map((g) => g.heading)).toEqual(["August 2026", "July 2026"]);
    expect(groups[0]?.photos.map((p) => p.takenOn)).toEqual(["2026-08-28", "2026-08-02"]);
  });

  it("does not mutate the input array", () => {
    const input = [{ takenOn: "2026-07-04" }, { takenOn: "2026-08-28" }];
    groupByMonth(input);
    expect(input.map((p) => p.takenOn)).toEqual(["2026-07-04", "2026-08-28"]);
  });

  it("returns nothing for no photos", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe("input validation", () => {
  const valid = {
    takenOn: "2026-08-28",
    mimeType: "image/jpeg" as const,
    byteSize: 1024,
    audienceOverride: null,
  };

  it("accepts a well-formed upload", () => {
    expect(photoUploadInput.safeParse(valid).success).toBe(true);
  });

  it("defaults audienceOverride to null — the gallery default, not a share", () => {
    const parsed = photoUploadInput.parse({
      takenOn: "2026-08-28",
      mimeType: "image/jpeg",
      byteSize: 1024,
    });
    expect(parsed.audienceOverride).toBeNull();
  });

  it("rejects a file type the bucket does not allow", () => {
    expect(photoUploadInput.safeParse({ ...valid, mimeType: "image/gif" }).success).toBe(false);
    expect(photoUploadInput.safeParse({ ...valid, mimeType: "application/pdf" }).success).toBe(false);
  });

  it("rejects a file past the bucket's 10 MB limit", () => {
    expect(photoUploadInput.safeParse({ ...valid, byteSize: 10 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(photoUploadInput.safeParse({ ...valid, byteSize: 0 }).success).toBe(false);
  });

  it("allows null to reset a photo to the gallery default", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(photoVisibilityInput.safeParse({ id, audienceOverride: null }).success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(photoVisibilityInput.safeParse({ id: "1", audienceOverride: null }).success).toBe(false);
  });
});
