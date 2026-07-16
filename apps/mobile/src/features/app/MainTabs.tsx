/**
 * Authenticated app shell: the 5-tab bottom bar + the current tab's body, with
 * the logging sheets mounted as full-screen overlays above everything.
 *
 * The center "Log" tab opens a chooser, which routes to either the Daily
 * Check-in or Quick Log; the other tabs are placeholders until their features
 * land (the Home dashboard waits on the readiness formula). Save handlers are
 * injected so the sheets stay presentation-only — MainTabs owns persistence.
 */
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../../ui/Screen";
import { GradientButton } from "../../ui/GradientButton";
import { TabBar } from "../../ui/TabBar";
import type { TabKey } from "../../ui/TabBarIcons";
import { size, space } from "../../ui/theme";
import { useAuth } from "../auth/AuthProvider";
import { Placeholder } from "./Placeholder";
import { LogChooser } from "./LogChooser";
import { CheckinSheet } from "../checkin/CheckinSheet";
import { submitCheckin, type CheckinInput } from "../checkin/checkinApi";
import { QuickLogSheet } from "../metrics/QuickLogSheet";
import { submitMetrics, type MetricEntry } from "../metrics/metricApi";

/** Which logging overlay is up, if any. */
type Sheet = "none" | "chooser" | "checkin" | "quicklog";

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [active, setActive] = useState<TabKey>("home");
  const [sheet, setSheet] = useState<Sheet>("none");

  const handleSubmit = useCallback(async (input: CheckinInput): Promise<number> => {
    return submitCheckin(input);
  }, []);

  const handleMetrics = useCallback(async (entries: MetricEntry[]): Promise<number> => {
    return submitMetrics(entries);
  }, []);

  return (
    <Screen>
      <View style={styles.root}>
        <View style={[styles.body, { paddingTop: insets.top + space.sm }]}>
          {active === "home" ? (
            <Placeholder title="No check-ins yet" subtitle="Log your first check-in to see your dashboard." />
          ) : active === "profile" ? (
            <Placeholder
              title="Profile"
              subtitle="Coming soon."
              footer={<GradientButton label="Sign out" variant="ghost" onPress={() => void signOut()} />}
            />
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

      {sheet === "checkin" ? (
        <CheckinSheet onClose={() => setSheet("none")} onSubmit={handleSubmit} />
      ) : null}

      {sheet === "quicklog" ? (
        <QuickLogSheet onClose={() => setSheet("none")} onSubmit={handleMetrics} />
      ) : null}
    </Screen>
  );
}

const TITLES: Record<TabKey, string> = {
  home: "Home",
  calendar: "Calendar",
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
