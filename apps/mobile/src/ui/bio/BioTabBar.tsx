/**
 * BIOSYNC floating tab bar — a glass pill hovering above the screen with four
 * content tabs (Home · Trends · Insights · You), a spacer, and a raised gradient
 * FAB in the centre that opens the log flow. Renders over the screen body;
 * screens pad their bottom to clear it.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import type { TabKey } from "../TabBarIcons";
import { pressHaptic } from "../../lib/haptics";
import { bio, fontFamily, motion } from "../theme";

function Glyph({ tab, active }: { tab: TabKey; active: boolean }) {
  const c = active ? bio.color.text : bio.alpha(0.4);
  const sw = 1.9;
  switch (tab) {
    case "home":
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M4 11 L12 4 L20 11 V20 H4 Z" stroke={c} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );
    case "calendar":
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M4 20 V13 M9 20 V8 M14 20 V11 M19 20 V5" stroke={c} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
    case "chat":
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 3 C12.6 8.4 15.1 10.4 20.5 11 C15.1 11.6 12.6 13.6 12 19 C11.4 13.6 8.9 11.6 3.5 11 C8.9 10.4 11.4 8.4 12 3 Z"
            stroke={c}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </Svg>
      );
    default:
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={8} r={4} stroke={c} strokeWidth={sw} />
          <Path d="M4.5 20 C4.5 16.4 8 14.5 12 14.5 C16 14.5 19.5 16.4 19.5 20" stroke={c} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
  }
}

function Tab({ tab, label, active, onPress }: { tab: TabKey; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.tab} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Glyph tab={tab} active={active} />
      <Text style={[styles.label, { color: active ? bio.color.text : bio.alpha(0.45) }]}>{label}</Text>
    </Pressable>
  );
}

export function BioTabBar({
  active,
  onSelect,
  onLog,
  bottomInset,
  fabTone = "brand",
}: {
  active: TabKey;
  onSelect: (t: TabKey) => void;
  onLog: () => void;
  bottomInset: number;
  /**
   * Recolours the ＋ to match the area you're in: "amber" in Nutrition (add a
   * meal), "magenta" in Supplements (add to stack).
   */
  fabTone?: "brand" | "amber" | "magenta";
}) {
  const scale = useSharedValue(1);
  const float = useSharedValue(0);

  // the design's `floaty` — the FAB drifts gently on every screen
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [float]);

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(float.value, [0, 1], [0, -5]) }, { scale: scale.value }],
  }));

  const fabColors: readonly [string, string] =
    fabTone === "amber"
      ? [bio.color.amberLt, bio.color.amberDeep]
      : fabTone === "magenta"
        ? [bio.color.magentaLt, bio.color.magentaDeep]
        : [bio.color.violetLt, bio.color.teal];
  /** the ＋ is knocked out in plum on magenta, ink elsewhere */
  const fabGlyph = fabTone === "magenta" ? bio.color.plum : bio.color.ink;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(bottomInset, 12) + 8 }]}>
      <View style={styles.bar}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={["rgba(24,23,34,0.85)", "rgba(16,15,24,0.85)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.row}>
          <Tab tab="home" label="Home" active={active === "home"} onPress={() => onSelect("home")} />
          <Tab tab="calendar" label="Trends" active={active === "calendar"} onPress={() => onSelect("calendar")} />
          <View style={styles.gap} />
          <Tab tab="chat" label="Ask" active={active === "chat"} onPress={() => onSelect("chat")} />
          <Tab tab="profile" label="You" active={active === "profile"} onPress={() => onSelect("profile")} />
        </View>
      </View>

      <Animated.View style={[styles.fabWrap, fabStyle]}>
        <Pressable
          onPress={onLog}
          onPressIn={() => {
            scale.value = withTiming(0.9, { duration: motion.duration.press, easing: motion.easeOut });
            pressHaptic();
          }}
          onPressOut={() => {
            scale.value = withSpring(1, motion.pressSpring);
          }}
          accessibilityRole="button"
          accessibilityLabel="Log"
        >
          <LinearGradient colors={fabColors} start={{ x: 0.3, y: 0.2 }} end={{ x: 1, y: 1 }} style={styles.fab}>
            <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
              <Path d="M9 2 V16 M2 9 H16" stroke={fabGlyph} strokeWidth={2.6} strokeLinecap="round" />
            </Svg>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 20, right: 20, alignItems: "center" },
  bar: {
    height: 70,
    alignSelf: "stretch",
    borderRadius: bio.radius.pill,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 30 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 5 },
  gap: { width: 44 },
  label: { fontFamily: fontFamily.semibold, fontSize: 9.5, letterSpacing: 0.4 },
  fabWrap: { position: "absolute", top: -12 },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
});
