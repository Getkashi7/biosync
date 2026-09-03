/**
 * Authenticated app shell: the 5-tab bottom bar + the current tab's body, with
 * the logging sheets mounted as full-screen overlays above everything.
 *
 * The center "Log" tab opens a chooser, which routes to either the Daily
 * Check-in or Quick Log; Home shows the readiness dashboard, and the remaining
 * tabs are placeholders until their features land. Save handlers are injected
 * so the sheets stay presentation-only — MainTabs owns persistence, and bumps
 * refreshKey when a logging sheet closes so the dashboard refetches.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Keyboard, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BioTabBar } from "../../ui/bio/BioTabBar";
import type { TabKey } from "../../ui/TabBarIcons";
import { bio } from "../../ui/theme";
import { Placeholder } from "./Placeholder";
import { LogChooser } from "./LogChooser";
import { CheckinSheet } from "../checkin/CheckinSheet";
import { submitCheckin, type CheckinInput } from "../checkin/checkinApi";
import { QuickLogSheet } from "../metrics/QuickLogSheet";
import { submitMetrics, type MetricEntry } from "../metrics/metricApi";
import { DashboardScreen } from "../dashboard/DashboardScreen";
import { InviteCreateScreen } from "../invites/InviteCreateScreen";
import { InviteCodeScreen } from "../invites/InviteCodeScreen";
import { InviteListScreen } from "../invites/InviteListScreen";
import { EnterCodeScreen } from "../invites/EnterCodeScreen";
import { CareTeamScreen } from "../invites/CareTeamScreen";
import { AdminScreen } from "../admin/AdminScreen";
import { fetchCareTeam } from "../invites/invitesApi";
import type { CreatedInvite, StaffKind } from "../invites/invitesApi";
import { TimelineScreen } from "../timeline/TimelineScreen";
import { NewGoalSheet } from "../goals/NewGoalSheet";
import { createGoal, type NewGoal } from "../goals/goalsApi";
import { ProfileScreen } from "../profile/ProfileScreen";
import { DeleteAccountSheet } from "../profile/DeleteAccountSheet";
import { CoachScreen } from "../coach/CoachScreen";
import { PlanSheet } from "../coach/PlanSheet";
import { NutritionScreen } from "../nutrition/NutritionScreen";
import { MealLogScreen } from "../nutrition/MealLogScreen";
import { AddMealSheet } from "../nutrition/AddMealSheet";
import { SupplementsScreen } from "../supplements/SupplementsScreen";
import { DoseStripScreen } from "../supplements/DoseStripScreen";
import { SuggestionsScreen } from "../supplements/SuggestionsScreen";
import { AddSupplementSheet } from "../supplements/AddSupplementSheet";
import { ConsentCentreScreen } from "../consent/ConsentCentreScreen";
import { PhotosGalleryScreen, type PendingUpload } from "../photos/PhotosGalleryScreen";
import { PhotoAddSheet } from "../photos/PhotoAddSheet";
import { PhotoDetailScreen } from "../photos/PhotoDetailScreen";
import { PhotoCompareScreen } from "../photos/PhotoCompareScreen";
import { fetchPhotos, fetchPhotosAudience, uploadPhoto, type ConsentAudience, type Photo } from "../photos/photosApi";
import { getUnitPref, type WeightUnit } from "../../lib/prefs";
import { todayIso } from "../../lib/photoFormat";
import type { PickedPhoto } from "../photos/photoPicker";
import { RolesScreen } from "../consent/RolesScreen";
import { MyTrainerScreen } from "../mytrainer/MyTrainerScreen";
import { TrainerRosterScreen } from "../trainer/TrainerRosterScreen";
import { TrainerClientScreen } from "../trainer/TrainerClientScreen";
import { SessionNoteScreen } from "../trainer/SessionNoteScreen";
import { PlanBuilderScreen } from "../trainer/PlanBuilderScreen";
import { RemindersSheet } from "../reminders/RemindersSheet";
import { syncReminders } from "../../lib/reminders";
import { trpc } from "../../lib/trpc";
import { getAppIntent, hasBeenWelcomed, markWelcomed, setAppIntent, type AppIntent } from "../../lib/prefs";
import { WelcomeFirstRun } from "./WelcomeFirstRun";
import { useAuth } from "../auth/AuthProvider";
import { NotProfessional } from "./NotProfessional";

/** Which overlay is up, if any. */
type Sheet =
  | "none"
  | "chooser"
  | "checkin"
  | "quicklog"
  | "newgoal"
  | "deleteaccount"
  | "reminders"
  | "plan"
  | "addmeal"
  | "addsupplement";

/**
 * Nutrition is a pushed area rather than a tab: it takes over the body while the
 * tab bar stays live (its ＋ turns amber and means "add a meal"). Picking any tab
 * leaves it.
 */
type NutritionView = "none" | "today" | "log";

/** Supplements is a pushed area too — its ＋ turns magenta and adds to the stack. */
type SupplementView = "none" | "stack" | "doses" | "suggestions";

/** The trust layer, pushed from Profile. */
type ConsentView = "none" | "centre" | "roles";

/** Progress photos, pushed from Profile. */
type PhotosView = "none" | "gallery";

/** The client's view of what a trainer shared, pushed from Profile. */
type ProfileArea = "none" | "trainerFeed" | "careTeam" | "enterCode" | "admin";

/** Where the staff invite flow is: the list, the create form, or a fresh code. */
type InviteView = { step: "none" } | { step: "list" } | { step: "create" } | { step: "code"; invite: CreatedInvite; lockedTo?: string | undefined };

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<TabKey>("home");
  const [sheet, setSheet] = useState<Sheet>("none");
  const [photosView, setPhotosView] = useState<PhotosView>("none");
  // Uploads still in flight, rendered as their own tiles in the grid so a photo
  // is never silently dropped.
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [photosKey, setPhotosKey] = useState(0);
  const [photoAdd, setPhotoAdd] = useState(false);
  const [galleryDefault, setGalleryDefault] = useState<ConsentAudience>("NONE");
  // Who this account is actually linked to. The add sheet needs it to be
  // honest: consent alone shares nothing, so picking an audience with nobody
  // connected has to say that rather than imply the photo went somewhere.
  const [connected, setConnected] = useState({ trainer: false, practitioner: false });
  /** the photo whose detail view is open, if any */
  const [openPhoto, setOpenPhoto] = useState<Photo | null>(null);
  /** the photo set being compared, if the compare screen is open */
  const [comparing, setComparing] = useState<Photo[] | null>(null);
  const [unitPref, setUnitPref2] = useState<WeightUnit>("kg");
  // Bumped when a logging sheet closes so the dashboard refetches its score.
  const [refreshKey, setRefreshKey] = useState(0);
  // Hide the floating tab bar while the keyboard is up (it would otherwise
  // overlap the Ask composer once the window resizes).
  const [keyboardUp, setKeyboardUp] = useState(false);
  // Capability is fetched HERE, inside the (app) area — never in the root
  // AuthProvider, which pulls the API client into RN's earliest startup and
  // breaks the runtime. Null until known, so we never flash the wrong shell.
  const [staff, setStaff] = useState<{ kind: string }[] | null>(null);
  /** platform role — only ADMIN unlocks the admin surface. Never a capability. */
  const [role, setRole] = useState<string | null>(null);
  /** which door they came through; decides the shell, never the permissions */
  const [intent, setIntent] = useState<AppIntent | null>(null);
  const [nutrition, setNutrition] = useState<NutritionView>("none");
  const [trainer, setTrainer] = useState(false);
  /** the client whose detail is open inside the trainer area */
  const [client, setClient] = useState<string | null>(null);
  /** the client a session note is being written for, if any */
  const [noteFor, setNoteFor] = useState<{ id: string; name: string } | null>(null);
  /** the client a plan is being built for, if any */
  const [planFor, setPlanFor] = useState<{ id: string; name: string } | null>(null);
  const [supplements, setSupplements] = useState<SupplementView>("none");
  const [consent, setConsent] = useState<ConsentView>("none");
  const [profileArea, setProfileArea] = useState<ProfileArea>("none");
  const [invite, setInvite] = useState<InviteView>({ step: "none" });
  /** bumped when a connection is made, so the care team refetches */
  const [teamKey, setTeamKey] = useState(0);
  /** null until we've read the flag, so the welcome never flashes on a relaunch */
  const [welcomed, setWelcomed] = useState<boolean | null>(null);
  const { session } = useAuth();
  /** name handed over from a suggestion — the user still writes dose + timing */
  const [seedName, setSeedName] = useState<string | null>(null);

  /**
   * Run one upload, keeping a tile in the grid the whole time. A failure leaves
   * the tile in place marked failed rather than dropping it, so a photo never
   * vanishes silently between picking it and it landing.
   */
  const runUpload = useCallback(
    async (key: string, photo: PickedPhoto, override: ConsentAudience | null, takenOn: string) => {
      setPending((ps) =>
        ps.some((p) => p.key === key)
          ? ps.map((p) => (p.key === key ? { ...p, failed: false, progress: 10 } : p))
          : [...ps, { key, takenOn, progress: 10, failed: false }],
      );
      const res = await uploadPhoto({
        uri: photo.uri,
        takenOn,
        mimeType: photo.mimeType,
        byteSize: photo.byteSize,
        audienceOverride: override,
      });
      if (res.ok) {
        setPending((ps) => ps.filter((p) => p.key !== key));
        setPhotosKey((k) => k + 1);
      } else {
        setPending((ps) => ps.map((p) => (p.key === key ? { ...p, failed: true, progress: null } : p)));
      }
    },
    [],
  );

  /** Keeps the picked photo so Retry can re-run the same upload. */
  const uploadInputs = useRef(new Map<string, { photo: PickedPhoto; override: ConsentAudience | null; takenOn: string }>());

  const closeSheet = useCallback(() => {
    setSheet("none");
    setRefreshKey((k) => k + 1);
  }, []);

  // Re-derive the scheduled reminder whenever the app returns to the foreground
  // (a check-in may have happened elsewhere, or a day may have rolled over).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncReminders();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void getAppIntent().then(setIntent);
    void hasBeenWelcomed().then(setWelcomed);
  }, []);

  /** Dismiss the welcome, remembering it, and optionally open the check-in. */
  const finishWelcome = useCallback((thenCheckin: boolean) => {
    void markWelcomed();
    setWelcomed(true);
    if (thenCheckin) setSheet("checkin");
  }, []);

  // Refetched whenever the app comes back to the foreground, so a capability
  // granted (or revoked) mid-session takes effect without a restart. On failure
  // we fall back to "no capability" — the safe direction is the consumer app.
  useEffect(() => {
    let alive = true;
    const load = () => {
      trpc.me
        .query()
        .then((u) => {
          if (!alive) return;
          setStaff(u?.staff ?? []);
          setRole(u?.role ?? null);
        })
        .catch(() => {
          if (!alive) return;
          setStaff([]);
          setRole(null);
        });
    };
    load();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") load();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardUp(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleSubmit = useCallback(async (input: CheckinInput): Promise<number | null> => {
    return submitCheckin(input);
  }, []);

  const handleMetrics = useCallback(async (entries: MetricEntry[]): Promise<number> => {
    return submitMetrics(entries);
  }, []);

  const handleGoal = useCallback(async (input: NewGoal): Promise<void> => {
    return createGoal(input);
  }, []);

  // Staff keep the consumer app — they have a body too. Capability decides what
  // they MAY do; intent decides which shell they see.
  const isStaff = (staff?.length ?? 0) > 0;
  /** The capacities this account holds — an invite can only be minted in one. */
  const staffKinds = (staff ?? [])
    .map((s) => s.kind)
    .filter((k): k is StaffKind => k === "PT" || k === "PRACTITIONER");

  // Wait for all three before rendering, so we never flash the wrong shell —
  // or the welcome at someone who dismissed it on a previous launch.
  if (staff === null || intent === null || welcomed === null) return <View style={styles.page} />;

  // First run on the consumer side. Staff coming through their own door skip it:
  // they're being onboarded by a person, not by an app, and the copy is about
  // the daily habit rather than the roster.
  if (!welcomed && intent === "personal") {
    return (
      <View style={styles.page}>
        <StatusBar style="light" />
        <WelcomeFirstRun
          name={session?.fullName?.trim().split(/\s+/)[0]}
          onStartCheckin={() => finishWelcome(true)}
          onExplore={() => finishWelcome(false)}
        />
      </View>
    );
  }

  // Came through the professional door without the capability to back it up.
  if (intent === "professional" && !isStaff) {
    return (
      <View style={styles.page}>
        <StatusBar style="light" />
        <NotProfessional
          onUsePersonal={() => {
            void setAppIntent("personal");
            setIntent("personal");
          }}
        />
      </View>
    );
  }

  const professionalShell = intent === "professional" && isStaff;

  if (professionalShell || (isStaff && trainer)) {
    return (
      <View style={styles.page}>
        <StatusBar style="light" />
        {invite.step === "code" ? (
          <InviteCodeScreen
            invite={invite.invite}
            lockedTo={invite.lockedTo}
            onDone={() => setInvite({ step: "list" })}
          />
        ) : invite.step === "create" ? (
          <InviteCreateScreen
            capabilities={staffKinds}
            onBack={() => setInvite({ step: "list" })}
            onCreated={(created) => setInvite({ step: "code", invite: created })}
          />
        ) : invite.step === "list" ? (
          <InviteListScreen
            onBack={() => setInvite({ step: "none" })}
            onCreate={() => setInvite({ step: "create" })}
          />
        ) : planFor ? (
          <PlanBuilderScreen
            clientId={planFor.id}
            clientName={planFor.name}
            onBack={() => setPlanFor(null)}
            onSaved={() => {
              setPlanFor(null);
              setRefreshKey((k) => k + 1);
            }}
          />
        ) : noteFor ? (
          <SessionNoteScreen
            clientId={noteFor.id}
            clientName={noteFor.name}
            onBack={() => setNoteFor(null)}
            onSaved={() => {
              setNoteFor(null);
              setRefreshKey((k) => k + 1);
            }}
          />
        ) : client ? (
          <TrainerClientScreen
            clientId={client}
            onBack={() => setClient(null)}
            onAddNote={(name) => setNoteFor({ id: client, name })}
            onBuildPlan={(name) => setPlanFor({ id: client, name })}
            refreshKey={refreshKey}
          />
        ) : (
          <TrainerRosterScreen
            trainerName="Your roster"
            onOpenClient={setClient}
            onInvite={() => setInvite({ step: "list" })}
          />
        )}
        {/*
          Only on the bare roster. The pushed sub-screens (client detail, note
          composer, plan builder) are full pages with their own back button and
          a bottom CTA — a floating tab bar would sit on top of "Save note" /
          "Assign plan". You leave those via Back, then the tab bar returns.
        */}
        {keyboardUp || client || noteFor || planFor || invite.step !== "none" ? null : (
          <BioTabBar
            active={active}
            onSelect={(t) => {
              // Picking one of their own tabs means "take me back to my app".
              // This is the way out of the professional shell, and it persists.
              void setAppIntent("personal");
              setIntent("personal");
              setTrainer(false);
              setClient(null);
              setNoteFor(null);
              setPlanFor(null);
              setActive(t);
            }}
            onLog={() => setSheet("chooser")}
            bottomInset={insets.bottom}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <StatusBar style="light" />
      {profileArea === "admin" ? (
        <AdminScreen onBack={() => setProfileArea("none")} />
      ) : profileArea === "enterCode" ? (
        <EnterCodeScreen
          onBack={() => setProfileArea("careTeam")}
          onOpenConsent={() => {
            setProfileArea("none");
            setConsent("centre");
          }}
          onConnected={() => setTeamKey((k) => k + 1)}
        />
      ) : profileArea === "careTeam" ? (
        <CareTeamScreen
          onBack={() => setProfileArea("none")}
          onEnterCode={() => setProfileArea("enterCode")}
          refreshKey={teamKey}
        />
      ) : profileArea === "trainerFeed" ? (
        <MyTrainerScreen onBack={() => setProfileArea("none")} />
      ) : comparing ? (
        <PhotoCompareScreen photos={comparing} unit={unitPref} onBack={() => setComparing(null)} />
      ) : openPhoto ? (
        <PhotoDetailScreen
          photo={openPhoto}
          galleryDefault={galleryDefault}
          unit={unitPref}
          onBack={() => setOpenPhoto(null)}
          onDeleted={() => {
            setOpenPhoto(null);
            setPhotosKey((k) => k + 1);
          }}
        />
      ) : photosView === "gallery" ? (
        <PhotosGalleryScreen
          onBack={() => setPhotosView("none")}
          onAdd={() => {
            void fetchPhotosAudience().then(setGalleryDefault).catch(() => {});
            void fetchCareTeam()
              .then((t) =>
                setConnected({
                  trainer: t.staff.some((s) => s.kind === "PT"),
                  practitioner: t.staff.some((s) => s.kind === "PRACTITIONER"),
                }),
              )
              .catch(() => {});
            setPhotoAdd(true);
          }}
          onOpenPhoto={(id) => {
            // The gallery already holds the row and its signed URL, so re-fetch
            // rather than thread it through: the URL is short-lived and a stale
            // one would open onto a photo that can't load.
            void Promise.all([fetchPhotos(), fetchPhotosAudience(), getUnitPref()])
              .then(([list, aud, u]) => {
                const found = list.find((p) => p.id === id);
                if (!found) return;
                setGalleryDefault(aud);
                setUnitPref2(u);
                setOpenPhoto(found);
              })
              .catch(() => {});
          }}
          onCompare={() => {
            void Promise.all([fetchPhotos(), getUnitPref()])
              .then(([list, u]) => {
                setUnitPref2(u);
                setComparing(list);
              })
              .catch(() => {});
          }}
          pending={pending}
          onRetry={(key) => {
            const input = uploadInputs.current.get(key);
            if (input) void runUpload(key, input.photo, input.override, input.takenOn);
          }}
          refreshKey={photosKey}
        />
      ) : consent === "centre" ? (
        <ConsentCentreScreen onBack={() => setConsent("none")} onOpenRoles={() => setConsent("roles")} />
      ) : consent === "roles" ? (
        <RolesScreen onBack={() => setConsent("centre")} />
      ) : supplements === "stack" ? (
        <SupplementsScreen
          onBack={() => setSupplements("none")}
          onAdd={() => setSheet("addsupplement")}
          onOpenDoses={() => setSupplements("doses")}
          onOpenSuggestions={() => setSupplements("suggestions")}
          refreshKey={refreshKey}
        />
      ) : supplements === "doses" ? (
        <DoseStripScreen
          onBack={() => setSupplements("stack")}
          onChanged={() => setRefreshKey((k) => k + 1)}
          refreshKey={refreshKey}
        />
      ) : supplements === "suggestions" ? (
        <SuggestionsScreen
          onBack={() => setSupplements("stack")}
          onAdd={(name) => {
            setSeedName(name);
            setSheet("addsupplement");
          }}
        />
      ) : nutrition === "today" ? (
        <NutritionScreen
          onBack={() => setNutrition("none")}
          onAddMeal={() => setSheet("addmeal")}
          onOpenLog={() => setNutrition("log")}
          refreshKey={refreshKey}
        />
      ) : nutrition === "log" ? (
        <MealLogScreen
          onBack={() => setNutrition("today")}
          onChanged={() => setRefreshKey((k) => k + 1)}
          refreshKey={refreshKey}
        />
      ) : active === "home" ? (
        <DashboardScreen
          onQuickLog={() => setSheet("quicklog")}
          onCheckin={() => setSheet("checkin")}
          refreshKey={refreshKey}
        />
      ) : active === "chat" ? (
        <CoachScreen />
      ) : active === "profile" ? (
        <ProfileScreen
          onDeleteAccount={() => setSheet("deleteaccount")}
          onReminders={() => setSheet("reminders")}
          onCoachPlan={() => setSheet("plan")}
          onConsent={() => setConsent("centre")}
          onPhotos={() => {
            setPhotosKey((k) => k + 1);
            setPhotosView("gallery");
          }}
          onTrainerFeed={() => setProfileArea("trainerFeed")}
          onCareTeam={() => setProfileArea("careTeam")}
          onAdmin={role === "ADMIN" ? () => setProfileArea("admin") : undefined}
          onTrainer={
            isStaff
              ? () => {
                  // switching shells persists, so a restart lands in the same place
                  void setAppIntent("professional");
                  setIntent("professional");
                }
              : undefined
          }
          refreshKey={refreshKey}
        />
      ) : active === "calendar" ? (
        <TimelineScreen onLog={() => setSheet("chooser")} refreshKey={refreshKey} />
      ) : (
        <Placeholder title={TITLES[active]} subtitle="Coming soon." />
      )}

      {keyboardUp ? null : (
        <BioTabBar
          active={active}
          onSelect={(t) => {
            setNutrition("none");
            setSupplements("none");
            setConsent("none");
            setProfileArea("none");
            setActive(t);
          }}
          onLog={() =>
            setSheet(supplements !== "none" ? "addsupplement" : nutrition !== "none" ? "addmeal" : "chooser")
          }
          bottomInset={insets.bottom}
          fabTone={supplements !== "none" ? "magenta" : nutrition !== "none" ? "amber" : "brand"}
        />
      )}

      {sheet === "chooser" ? (
        <LogChooser
          onClose={() => setSheet("none")}
          onCheckin={() => setSheet("checkin")}
          onQuickLog={() => setSheet("quicklog")}
          onNutrition={() => setNutrition("today")}
          onSupplements={() => setSupplements("stack")}
        />
      ) : null}

      {photoAdd ? (
        <PhotoAddSheet
          galleryDefault={galleryDefault}
          practitionerConnected={connected.practitioner}
          trainerConnected={connected.trainer}
          onClose={() => setPhotoAdd(false)}
          onPicked={(photo, override) => {
            setPhotoAdd(false);
            const key = `u${Date.now()}`;
            const takenOn = todayIso();
            uploadInputs.current.set(key, { photo, override, takenOn });
            void runUpload(key, photo, override, takenOn);
          }}
        />
      ) : null}

      {sheet === "checkin" ? <CheckinSheet onClose={closeSheet} onSubmit={handleSubmit} /> : null}

      {sheet === "quicklog" ? <QuickLogSheet onClose={closeSheet} onSubmit={handleMetrics} /> : null}

      {sheet === "newgoal" ? <NewGoalSheet onClose={closeSheet} onSubmit={handleGoal} /> : null}

      {sheet === "deleteaccount" ? <DeleteAccountSheet onClose={() => setSheet("none")} /> : null}

      {sheet === "reminders" ? <RemindersSheet onClose={closeSheet} /> : null}

      {sheet === "plan" ? <PlanSheet onClose={() => setSheet("none")} /> : null}

      {sheet === "addmeal" ? (
        <AddMealSheet
          onClose={() => setSheet("none")}
          onSaved={() => {
            // the rings + log follow the new meal immediately
            setRefreshKey((k) => k + 1);
            if (nutrition === "none") setNutrition("today");
          }}
        />
      ) : null}

      {sheet === "addsupplement" ? (
        <AddSupplementSheet
          seedName={seedName}
          onClose={() => {
            setSheet("none");
            setSeedName(null);
          }}
          onSaved={() => {
            setRefreshKey((k) => k + 1);
            setSupplements("stack");
          }}
        />
      ) : null}
    </View>
  );
}

const TITLES: Record<TabKey, string> = {
  home: "Home",
  calendar: "Journal",
  log: "Log",
  chat: "Chat",
  profile: "Profile",
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: bio.color.ink,
    overflow: "hidden",
  },
});

// re-export so the route file can default-export it
export default MainTabs;
