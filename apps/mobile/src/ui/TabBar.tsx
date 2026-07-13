/**
 * Bottom tab bar — 5 tabs matching the design (Home · Calendar · Log · Chat ·
 * Profile). The center "Log" tab is the primary action: it always shows the
 * gradient icon and opens the check-in sheet (fires a light haptic + press
 * scale) rather than switching content. The active content tab shows the
 * gradient icon; the rest are faint.
 *
 * Solid #0E0E13, 1px hairline top, no blur. Height = 54 + insets.bottom.
 */
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { TabIcon, type TabKey } from "./TabBarIcons";
import { pressHaptic } from "../lib/haptics";
import { color, motion, size } from "./theme";

const TABS: TabKey[] = ["home", "calendar", "log", "chat", "profile"];

const LABELS: Record<TabKey, string> = {
  home: "Home",
  calendar: "Calendar",
  log: "Log check-in",
  chat: "Chat",
  profile: "Profile",
};

function TabButton({
  tab,
  active,
  isAction,
  onPress,
}: {
  tab: TabKey;
  active: boolean;
  isAction: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(motion.pressScale, { duration: motion.duration.press, easing: motion.easeOut });
        if (isAction) pressHaptic();
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.pressSpring);
      }}
      accessibilityRole="button"
      accessibilityLabel={LABELS[tab]}
      accessibilityState={{ selected: active }}
    >
      <Animated.View style={animatedStyle}>
        {/* The Log action always renders its gradient treatment. */}
        <TabIcon tab={tab} active={active || isAction} />
      </Animated.View>
    </Pressable>
  );
}

type Props = {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
  onLog: () => void;
  bottomInset: number;
};

export function TabBar({ active, onSelect, onLog, bottomInset }: Props) {
  return (
    <View style={[styles.bar, { height: size.tabBar + bottomInset, paddingBottom: bottomInset }]}>
      {TABS.map((tab) => {
        const isAction = tab === "log";
        return (
          <TabButton
            key={tab}
            tab={tab}
            active={active === tab}
            isAction={isAction}
            onPress={() => (isAction ? onLog() : onSelect(tab))}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: color.inset,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
