/**
 * Hardware Back, branch by branch.
 *
 * This is the test the render chain cannot have. `MainTabs` resolves its
 * screen through a hand-ordered ternary chain that no test can reach, and that
 * chain has already drifted once — the tab-reset bug, where three photo
 * branches outranked the tab branches and tapping a tab did nothing. `backTarget`
 * exists so the same ordering is asserted rather than remembered.
 *
 * The property that matters most is at the bottom: **every pushed screen must
 * move**. A state that renders something with a back chevron and returns
 * `"exit"` is the original bug — Back closing the app instead of going back one.
 */
import { describe, it, expect } from "vitest";
import { backTarget, type BackState } from "../backTarget";

const root: BackState = {
  shell: "consumer",
  sheetOpen: false,
  photoAdd: false,
  offer: false,
  inviteStep: "none",
  planFor: false,
  noteFor: false,
  coachProfile: false,
  coachClasses: false,
  reviewQueue: false,
  clientCompare: false,
  clientPhoto: false,
  accessRecord: false,
  client: false,
  profileArea: "none",
  adminView: "home",
  gymView: "schedule",
  comparing: false,
  openPhoto: false,
  photosView: "none",
  consent: "none",
  supplements: "none",
  nutrition: "none",
};

const at = (over: Partial<BackState>): BackState => ({ ...root, ...over });

describe("tab roots", () => {
  it("hands Back to Android at a tab root", () => {
    expect(backTarget(root)).toBe("exit");
  });

  it("hands Back to Android on the bare roster", () => {
    expect(backTarget(at({ shell: "professional" }))).toBe("exit");
  });
});

describe("overlays come first", () => {
  /**
   * A sheet is the topmost thing on screen, so Back closes it — and it does so
   * in either shell, because a sheet opened over the roster is still the thing
   * in front of you.
   */
  it("closes a sheet before anything underneath it", () => {
    expect(backTarget(at({ sheetOpen: true, photosView: "gallery" }))).toBe("closeSheet");
    expect(backTarget(at({ shell: "professional", sheetOpen: true, client: true }))).toBe(
      "closeSheet",
    );
  });

  it("closes the photo add sheet, then the treatment offer", () => {
    expect(backTarget(at({ photoAdd: true, photosView: "gallery" }))).toBe("closePhotoAdd");
    expect(backTarget(at({ offer: true }))).toBe("closeOffer");
  });

  it("prefers a sheet over the add sheet over the offer", () => {
    expect(backTarget(at({ sheetOpen: true, photoAdd: true, offer: true }))).toBe("closeSheet");
    expect(backTarget(at({ photoAdd: true, offer: true }))).toBe("closePhotoAdd");
  });
});

describe("the photo screens — the ones that used to close the app", () => {
  it("steps compare → photo → gallery → out", () => {
    expect(backTarget(at({ comparing: true, photosView: "gallery" }))).toBe("clearComparing");
    expect(backTarget(at({ openPhoto: true, photosView: "gallery" }))).toBe("clearOpenPhoto");
    expect(backTarget(at({ photosView: "gallery" }))).toBe("photosNone");
  });
});

describe("the consumer stacks", () => {
  it("returns an admin sub-screen to the hub, and the hub out", () => {
    for (const v of ["audit", "members", "trends", "venues"] as const) {
      expect(backTarget(at({ profileArea: "admin", adminView: v }))).toBe("adminToHub");
    }
    expect(backTarget(at({ profileArea: "admin", adminView: "home" }))).toBe("profileAreaNone");
  });

  it("returns a gym sub-screen to the schedule, and the schedule out", () => {
    for (const v of ["coaches", "checkin", "history"] as const) {
      expect(backTarget(at({ profileArea: "gym", gymView: v }))).toBe("gymToSchedule");
    }
    expect(backTarget(at({ profileArea: "gym", gymView: "schedule" }))).toBe("profileAreaNone");
  });

  /**
   * The one back step that is not "pop to root": the code form is reached from
   * the care team and returns to it, matching the chevron.
   */
  it("returns the code form and the trainer feed to the care team", () => {
    expect(backTarget(at({ profileArea: "enterCode" }))).toBe("profileAreaCareTeam");
    expect(backTarget(at({ profileArea: "trainerFeed" }))).toBe("profileAreaCareTeam");
  });

  it("pops the flat profile areas straight out", () => {
    for (const a of ["careTeam", "treatments", "journal", "export", "preferences"] as const) {
      expect(backTarget(at({ profileArea: a }))).toBe("profileAreaNone");
    }
  });

  it("steps consent and supplements through their own stacks", () => {
    expect(backTarget(at({ consent: "roles" }))).toBe("consentCentre");
    expect(backTarget(at({ consent: "access" }))).toBe("consentCentre");
    expect(backTarget(at({ consent: "centre" }))).toBe("consentNone");
    expect(backTarget(at({ supplements: "doses" }))).toBe("supplementsStack");
    expect(backTarget(at({ supplements: "suggestions" }))).toBe("supplementsStack");
    expect(backTarget(at({ supplements: "stack" }))).toBe("supplementsNone");
  });

  it("steps the meal log back to today, and today out", () => {
    expect(backTarget(at({ nutrition: "log" }))).toBe("nutritionToday");
    expect(backTarget(at({ nutrition: "today" }))).toBe("nutritionNone");
  });

  /** A profile area outranks a photo route, the same way the render chain does. */
  it("keeps the render chain's precedence between an area and a photo", () => {
    expect(backTarget(at({ profileArea: "journal", openPhoto: true }))).toBe("profileAreaNone");
  });
});

describe("the professional stacks", () => {
  it("steps the invite flow back through the list", () => {
    expect(backTarget(at({ shell: "professional", inviteStep: "code" }))).toBe("inviteToList");
    expect(backTarget(at({ shell: "professional", inviteStep: "create" }))).toBe("inviteToList");
    expect(backTarget(at({ shell: "professional", inviteStep: "list" }))).toBe("inviteClose");
  });

  it("pops each pushed staff screen", () => {
    const cases: Array<[Partial<BackState>, string]> = [
      [{ planFor: true }, "clearPlanFor"],
      [{ noteFor: true }, "clearNoteFor"],
      [{ coachProfile: true }, "clearCoachProfile"],
      [{ coachClasses: true }, "clearCoachClasses"],
      [{ reviewQueue: true }, "clearReviewQueue"],
      [{ clientCompare: true }, "clearClientCompare"],
      [{ clientPhoto: true }, "clearClientPhoto"],
      [{ accessRecord: true }, "clearAccessRecord"],
      [{ client: true }, "clearClient"],
    ];
    for (const [over, want] of cases) {
      expect(backTarget(at({ shell: "professional", ...over }))).toBe(want);
    }
  });

  /**
   * A client photo is opened *from* a client, so both flags are set at once.
   * Back must unwind the photo first, not drop the whole client screen.
   */
  it("unwinds the access record before the client it was opened from", () => {
    expect(backTarget(at({ shell: "professional", client: true, accessRecord: true }))).toBe(
      "clearAccessRecord",
    );
  });

  it("unwinds a client photo before the client under it", () => {
    expect(backTarget(at({ shell: "professional", client: true, clientPhoto: true }))).toBe(
      "clearClientPhoto",
    );
    expect(backTarget(at({ shell: "professional", client: true, clientCompare: true }))).toBe(
      "clearClientCompare",
    );
  });

  /** Consumer state must not leak into the professional shell's Back. */
  it("ignores consumer state while the professional shell is up", () => {
    expect(backTarget(at({ shell: "professional", photosView: "gallery" }))).toBe("exit");
  });
});

/**
 * The regression guard, driven off the state rather than a list someone keeps
 * in their head: anything that puts a pushed screen on top must move somewhere,
 * never `"exit"`. This is the assertion that would have caught Back closing the
 * app from the photo gallery.
 */
describe("no pushed screen lets Back close the app", () => {
  const pushed: Array<[string, Partial<BackState>]> = [
    ["sheet", { sheetOpen: true }],
    ["photoAdd", { photoAdd: true }],
    ["offer", { offer: true }],
    ["gallery", { photosView: "gallery" }],
    ["photo", { openPhoto: true }],
    ["compare", { comparing: true }],
    ["consent centre", { consent: "centre" }],
    ["roles", { consent: "roles" }],
    ["who has looked", { consent: "access" }],
    ["supplements", { supplements: "stack" }],
    ["doses", { supplements: "doses" }],
    ["suggestions", { supplements: "suggestions" }],
    ["nutrition", { nutrition: "today" }],
    ["meal log", { nutrition: "log" }],
    ["trainer feed", { profileArea: "trainerFeed" }],
    ["care team", { profileArea: "careTeam" }],
    ["enter code", { profileArea: "enterCode" }],
    ["treatments", { profileArea: "treatments" }],
    ["journal", { profileArea: "journal" }],
    ["export", { profileArea: "export" }],
    ["preferences", { profileArea: "preferences" }],
    ["admin hub", { profileArea: "admin" }],
    ["audit log", { profileArea: "admin", adminView: "audit" }],
    ["members", { profileArea: "admin", adminView: "members" }],
    ["trends", { profileArea: "admin", adminView: "trends" }],
    ["venues", { profileArea: "admin", adminView: "venues" }],
    ["gym", { profileArea: "gym" }],
    ["coaches", { profileArea: "gym", gymView: "coaches" }],
    ["check in", { profileArea: "gym", gymView: "checkin" }],
    ["gym history", { profileArea: "gym", gymView: "history" }],
  ];

  for (const [name, over] of pushed) {
    it(`moves rather than exiting from ${name}`, () => {
      expect(backTarget(at(over))).not.toBe("exit");
    });
  }

  const pushedPro: Array<[string, Partial<BackState>]> = [
    ["a client", { client: true }],
    ["a client photo", { clientPhoto: true }],
    ["a client compare", { clientCompare: true }],
    ["an access record", { accessRecord: true }],
    ["a note", { noteFor: true }],
    ["a plan", { planFor: true }],
    ["the review queue", { reviewQueue: true }],
    ["coach classes", { coachClasses: true }],
    ["the coach profile", { coachProfile: true }],
    ["the invite list", { inviteStep: "list" }],
    ["the invite form", { inviteStep: "create" }],
    ["a fresh code", { inviteStep: "code" }],
  ];

  for (const [name, over] of pushedPro) {
    it(`moves rather than exiting from ${name}`, () => {
      expect(backTarget(at({ shell: "professional", ...over }))).not.toBe("exit");
    });
  }
});
