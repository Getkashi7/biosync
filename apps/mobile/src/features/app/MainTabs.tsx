/**
 * Authenticated app shell: the 5-tab bottom bar + the current tab's body, with
 * the Daily Check-in sheet mounted as a full-screen overlay above everything.
 *
 * Only the center "Log" tab opens the sheet; the other tabs are placeholders
 * until their features land (the Home dashboard waits on workout/meal logs and
 * the readiness formula). The save handler is injected so the sheet stays
 * presentation-only — MainTabs owns how a check-in is persisted.
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
import { CheckinSheet } from "../checkin/CheckinSheet";
import { submitCheckin, type CheckinInput } from "../checkin/checkinApi";

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [active, setActive] = useState<TabKey>("home");
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSubmit = useCallback(async (input: CheckinInput): Promise<number> => {
    return submitCheckin(input);
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

        <TabBar active={active} onSelect={setActive} onLog={() => setSheetOpen(true)} bottomInset={insets.bottom} />
      </View>

      {sheetOpen ? <CheckinSheet onClose={() => setSheetOpen(false)} onSubmit={handleSubmit} /> : null}
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
