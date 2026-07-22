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
import { useCallback, useEffect, useState } from "react";
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
import { RolesScreen } from "../consent/RolesScreen";
import { TrainerRosterScreen } from "../trainer/TrainerRosterScreen";
import { TrainerClientScreen } from "../trainer/TrainerClientScreen";
import { SessionNoteScreen } from "../trainer/SessionNoteScreen";
import { PlanBuilderScreen } from "../trainer/PlanBuilderScreen";
import { RemindersSheet } from "../reminders/RemindersSheet";
import { syncReminders } from "../../lib/reminders";
import { trpc } from "../../lib/trpc";
import { getAppIntent, setAppIntent, type AppIntent } from "../../lib/prefs";
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

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<TabKey>("home");
  const [sheet, setSheet] = useState<Sheet>("none");
  // Bumped when a logging sheet closes so the dashboard refetches its score.
  const [refreshKey, setRefreshKey] = useState(0);
  // Hide the floating tab bar while the keyboard is up (it would otherwise
  // overlap the Ask composer once the window resizes).
  const [keyboardUp, setKeyboardUp] = useState(false);
  // Capability is fetched HERE, inside the (app) area — never in the root
  // AuthProvider, which pulls the API client into RN's earliest startup and
  // breaks the runtime. Null until known, so we never flash the wrong shell.
  const [staff, setStaff] = useState<{ kind: string }[] | null>(null);
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
  /** name handed over from a suggestion — the user still writes dose + timing */
  const [seedName, setSeedName] = useState<string | null>(null);

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
  }, []);

  // Refetched whenever the app comes back to the foreground, so a capability
  // granted (or revoked) mid-session takes effect without a restart. On failure
  // we fall back to "no capability" — the safe direction is the consumer app.
  useEffect(() => {
    let alive = true;
    const load = () => {
      trpc.me
        .query()
        .then((u) => alive && setStaff(u?.staff ?? []))
        .catch(() => alive && setStaff([]));
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

  // Wait for both before rendering, so we never flash the wrong shell.
  if (staff === null || intent === null) return <View style={styles.page} />;

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
        {planFor ? (
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
          <TrainerRosterScreen trainerName="Your roster" onOpenClient={setClient} />
        )}
        {/*
          Only on the bare roster. The pushed sub-screens (client detail, note
          composer, plan builder) are full pages with their own back button and
          a bottom CTA — a floating tab bar would sit on top of "Save note" /
          "Assign plan". You leave those via Back, then the tab bar returns.
        */}
        {keyboardUp || client || noteFor || planFor ? null : (
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
      {consent === "centre" ? (
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
