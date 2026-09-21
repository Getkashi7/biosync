/**
 * What Android's hardware Back button should do, given where the shell is.
 *
 * **Why this is a pure function and not an `if` chain inside `MainTabs`.**
 * Before this existed there was no `BackHandler` anywhere in the app, so Back
 * from any pushed screen fell through to expo-router at the stack root and
 * *closed BIOSYNC* — verified on the S23 on 2026-09-20: open Progress photos,
 * press Back, and you are looking at the launcher. The obvious fix is another
 * hand-ordered ternary chain next to the render's hand-ordered ternary chain,
 * and that is exactly the shape that already produced the tab-reset bug, where
 * three branches outranked the tab branches and nobody remembered to clear
 * them. Two chains that must agree, neither testable, is worse than one.
 *
 * So the *ordering* lives here, over a plain snapshot with no React in it, and
 * `MainTabs` only maps the returned action onto its setters. The order below
 * mirrors the render chain's precedence exactly, and `backTarget.test.ts`
 * walks every branch — which is the part the render chain can never have,
 * because mobile has no component testing.
 *
 * `"exit"` means *let Android have it*: at a tab root, Back leaving the app is
 * correct, and the handler returns false so the OS does its normal thing.
 */

export type BackShell = "consumer" | "professional";

export type BackState = {
  shell: BackShell;

  /* Overlays. These sit above both shells: a sheet is the topmost thing on
     screen, so it is what Back closes first, whichever shell is under it. */
  sheetOpen: boolean;
  photoAdd: boolean;
  offer: boolean;

  /* Professional shell */
  inviteStep: "none" | "list" | "create" | "code";
  planFor: boolean;
  noteFor: boolean;
  coachProfile: boolean;
  coachClasses: boolean;
  reviewQueue: boolean;
  clientCompare: boolean;
  clientPhoto: boolean;
  /** 9F, pushed from a client's screen */
  accessRecord: boolean;
  client: boolean;

  /* Consumer shell */
  profileArea:
    | "none"
    | "trainerFeed"
    | "careTeam"
    | "enterCode"
    | "admin"
    | "treatments"
    | "journal"
    | "gym"
    | "export"
    | "preferences";
  adminView: "home" | "audit" | "members" | "trends" | "venues";
  gymView: "schedule" | "coaches" | "checkin" | "history";
  comparing: boolean;
  openPhoto: boolean;
  photosView: "none" | "gallery";
  consent: "none" | "centre" | "roles" | "access";
  supplements: "none" | "stack" | "doses" | "suggestions";
  nutrition: "none" | "today" | "log";
};

export type BackAction =
  | "closeSheet"
  | "closePhotoAdd"
  | "closeOffer"
  | "inviteToList"
  | "inviteClose"
  | "clearPlanFor"
  | "clearNoteFor"
  | "clearCoachProfile"
  | "clearCoachClasses"
  | "clearReviewQueue"
  | "clearClientCompare"
  | "clearClientPhoto"
  | "clearAccessRecord"
  | "clearClient"
  | "adminToHub"
  | "profileAreaCareTeam"
  | "gymToSchedule"
  | "profileAreaNone"
  | "clearComparing"
  | "clearOpenPhoto"
  | "photosNone"
  | "consentNone"
  | "consentCentre"
  | "supplementsNone"
  | "supplementsStack"
  | "nutritionNone"
  | "nutritionToday"
  | "exit";

export function backTarget(s: BackState): BackAction {
  // Overlays first, in the order they stack.
  if (s.sheetOpen) return "closeSheet";
  if (s.photoAdd) return "closePhotoAdd";
  if (s.offer) return "closeOffer";

  if (s.shell === "professional") {
    // The invite flow is its own three-step stack: the code and the form both
    // fall back to the list, and the list leaves the flow.
    if (s.inviteStep === "code" || s.inviteStep === "create") return "inviteToList";
    if (s.inviteStep === "list") return "inviteClose";
    if (s.planFor) return "clearPlanFor";
    if (s.noteFor) return "clearNoteFor";
    if (s.coachProfile) return "clearCoachProfile";
    if (s.coachClasses) return "clearCoachClasses";
    if (s.reviewQueue) return "clearReviewQueue";
    if (s.clientCompare) return "clearClientCompare";
    if (s.clientPhoto) return "clearClientPhoto";
    if (s.accessRecord) return "clearAccessRecord";
    if (s.client) return "clearClient";
    // The bare roster is this shell's root.
    return "exit";
  }

  if (s.profileArea === "admin") {
    return s.adminView === "home" ? "profileAreaNone" : "adminToHub";
  }
  // Entering a code and the trainer feed are both reached *from* the care
  // team, so they return there rather than all the way out.
  if (s.profileArea === "enterCode" || s.profileArea === "trainerFeed") {
    return "profileAreaCareTeam";
  }
  if (s.profileArea === "gym") {
    return s.gymView === "schedule" ? "profileAreaNone" : "gymToSchedule";
  }
  if (s.profileArea !== "none") return "profileAreaNone";

  if (s.comparing) return "clearComparing";
  if (s.openPhoto) return "clearOpenPhoto";
  if (s.photosView === "gallery") return "photosNone";

  // Roles and the access record are both opened from the centre.
  if (s.consent === "roles" || s.consent === "access") return "consentCentre";
  if (s.consent === "centre") return "consentNone";

  if (s.supplements === "doses" || s.supplements === "suggestions") return "supplementsStack";
  if (s.supplements === "stack") return "supplementsNone";

  if (s.nutrition === "log") return "nutritionToday";
  if (s.nutrition === "today") return "nutritionNone";

  // A tab root. Back belongs to Android here.
  return "exit";
}
