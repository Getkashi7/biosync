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
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../../ui/Screen";
import { TabBar } from "../../ui/TabBar";
import type { TabKey } from "../../ui/TabBarIcons";
import { size, space } from "../../ui/theme";
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

/** Which overlay is up, if any. */
type Sheet = "none" | "chooser" | "checkin" | "quicklog" | "newgoal" | "deleteaccount";

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<TabKey>("home");
  const [sheet, setSheet] = useState<Sheet>("none");
  // Bumped when a logging sheet closes so the dashboard refetches its score.
  const [refreshKey, setRefreshKey] = useState(0);

  const closeSheet = useCallback(() => {
    setSheet("none");
    setRefreshKey((k) => k + 1);
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

  return (
    <Screen>
      <View style={styles.root}>
        <View style={[styles.body, { paddingTop: insets.top + space.sm }]}>
          {active === "home" ? (
            <DashboardScreen
              onQuickLog={() => setSheet("quicklog")}
              onNewGoal={() => setSheet("newgoal")}
              refreshKey={refreshKey}
            />
          ) : active === "calendar" ? (
            <TimelineScreen onLog={() => setSheet("chooser")} refreshKey={refreshKey} />
          ) : active === "profile" ? (
            <ProfileScreen onDeleteAccount={() => setSheet("deleteaccount")} />
          ) : (
            <Placeholder title={TITLES[active]} subtitle="Coming soon." />
          )}
        </View>

        <TabBar active={active} onSelect={setActive} onLog={() => setSheet("chooser")} bottomInset={insets.bottom} />
      </View>

      {sheet === "chooser" ? (
        <LogChooser
          onClose={() => setSheet("none")}
          onCheckin={() => setSheet("checkin")}
          onQuickLog={() => setSheet("quicklog")}
        />
      ) : null}

      {sheet === "checkin" ? <CheckinSheet onClose={closeSheet} onSubmit={handleSubmit} /> : null}

      {sheet === "quicklog" ? <QuickLogSheet onClose={closeSheet} onSubmit={handleMetrics} /> : null}

      {sheet === "newgoal" ? <NewGoalSheet onClose={closeSheet} onSubmit={handleGoal} /> : null}

      {sheet === "deleteaccount" ? <DeleteAccountSheet onClose={() => setSheet("none")} /> : null}
    </Screen>
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
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: size.screenPadX,
    backgroundColor: "transparent",
  },
});

// re-export so the route file can default-export it
export default MainTabs;
