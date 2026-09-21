/**
 * The floating tab bar — built to the N1 handoff.
 *
 * Four tabs (Home · Train · Ask · You) around a raised centre FAB that opens
 * the log flow. Renders over the screen body; screens pad their bottom to clear
 * it, and it unmounts entirely while the keyboard is up rather than fading —
 * an invisible bar still captures touches over a composer.
 *
 * Two changes from what came before, both the handoff's:
 *
 * **The glass is gone.** It was a blur layer plus a linear sheen; N1 specifies a
 * flat `#0D0C15` with a single hairline, which is the same restraint the rest of
 * the redesign applies. One less layer, and no blur to pay for every frame.
 *
 * **The FAB's gradient is radial**, off-centre at 32%/28%. That is
 * `react-native-svg`, not `expo-linear-gradient`, which only does linear
 * (CLAUDE.md). It sits inside a page-coloured ring so the bar reads as notched
 * rather than overlapped.
 */
import { useEffect } from "react";
import { useId } from "react";
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
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
import type { TabKey } from "../TabBarIcons";
import { pressHaptic } from "../../lib/haptics";
import { bio, fontFamily, motion } from "../theme";

/**
 * The glyphs, at the handoff's 20×20 viewBox and 1.9 stroke.
 *
 * Train is N1's recommended "Barbell, angled" — a bar and two plates, drawn to
 * the handoff's own coordinates. (An earlier cut drew a kettlebell that was in
 * no candidate; this is the one the design picked.)
 */
function Glyph({ tab, active }: { tab: TabKey; active: boolean }) {
  const c = active ? bio.color.white : bio.alpha(0.4);
  const sw = 1.9;
  switch (tab) {
    case "home":
      return (
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
          <Path
            d="M3.3 8.7 10 3.3l6.7 5.4V16a.9.9 0 0 1-.9.9H4.2a.9.9 0 0 1-.9-.9Z"
            stroke={c}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "train":
      return (
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
          <Path
            d="M5.15 12.8 14.85 7.2M3.4 9.77 6.9 15.83M13.1 4.17 16.6 10.23"
            stroke={c}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "chat":
      return (
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
          <Path
            d="M10 3.5c0 4 2.5 6.5 6.5 6.5-4 0-6.5 2.5-6.5 6.5 0-4-2.5-6.5-6.5-6.5 4 0 6.5-2.5 6.5-6.5Z"
            stroke={c}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    default:
      return (
        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
          <Circle cx={10} cy={6.6} r={3} stroke={c} strokeWidth={sw} />
          <Path
            d="M4.4 16.4c0-3.1 2.5-5 5.6-5s5.6 1.9 5.6 5"
            stroke={c}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </Svg>
      );
  }
}

function Tab({
  tab,
  label,
  active,
  onPress,
}: {
  tab: TabKey;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    // "tab" rather than "button": a screen reader then announces it as one of a
    // set ("Home, tab, 1 of 4, selected") instead of four unrelated buttons.
    <Pressable
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Glyph tab={tab} active={active} />
      <Text style={[styles.label, { color: active ? bio.color.white : bio.alpha(0.4) }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The raised ＋, its gradient radial per the handoff. */
function Fab({ tone }: { tone: "brand" | "amber" | "magenta" }) {
  const id = `fab${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [from, to] =
    tone === "amber"
      ? [bio.color.amberLt, bio.color.amberDeep]
      : tone === "magenta"
        ? [bio.color.magentaLt, bio.color.magentaDeep]
        : [bio.color.violetLt, bio.color.teal];
  /** the ＋ is knocked out in plum on magenta, page-ink elsewhere */
  const glyph = tone === "magenta" ? bio.color.plum : bio.color.page;

  return (
    <Svg width={54} height={54} viewBox="0 0 54 54">
      <Defs>
        <RadialGradient id={id} cx="32%" cy="28%" r="80%">
          <Stop offset="0%" stopColor={from} stopOpacity={0.95} />
          <Stop offset="100%" stopColor={to} stopOpacity={0.85} />
        </RadialGradient>
      </Defs>
      <Circle cx={27} cy={27} r={27} fill={`url(#${id})`} />
      <G>
        <Path
          d="M27 18.4v17.2M18.4 27h17.2"
          stroke={glyph}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </G>
    </Svg>
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
    float.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [float]);

  const fabStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(float.value, [0, 1], [0, -5]) },
      { scale: scale.value },
    ],
  }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(bottomInset, 12) + 8 }]}>
      <View style={styles.bar}>
        <View style={styles.row} accessibilityRole="tablist">
          <Tab tab="home" label="Home" active={active === "home"} onPress={() => onSelect("home")} />
          <Tab
            tab="train"
            label="Train"
            active={active === "train"}
            onPress={() => onSelect("train")}
          />
          <View style={styles.gap} />
          <Tab tab="chat" label="Ask" active={active === "chat"} onPress={() => onSelect("chat")} />
          <Tab
            tab="profile"
            label="You"
            active={active === "profile"}
            onPress={() => onSelect("profile")}
          />
        </View>
      </View>

      <Animated.View style={[styles.fabWrap, fabStyle]}>
        {/* A page-coloured ring, so the bar reads as notched around the FAB
            rather than as something sitting on top of it. */}
        <View style={styles.fabRing}>
          <Pressable
            onPress={onLog}
            onPressIn={() => {
              scale.value = withTiming(0.9, {
                duration: motion.duration.press,
                easing: motion.easeOut,
              });
              pressHaptic();
            }}
            onPressOut={() => {
              scale.value = withSpring(1, motion.pressSpring);
            }}
            accessibilityRole="button"
            accessibilityLabel="Log"
          >
            <Fab tone={fabTone} />
          </Pressable>
        </View>
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
    // Flat, per N1 — no blur layer and no sheen gradient.
    backgroundColor: bio.color.surface,
    borderWidth: 1,
    borderColor: bio.color.hairline,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 30,
  },
  tab: { width: 44, alignItems: "center", justifyContent: "center", gap: 5 },
  gap: { width: 44 },
  label: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 0.42 },
  pressed: { transform: [{ scale: 0.97 }] },

  // -17 puts the ring's centre 15px below the bar's top edge, which is where
  // the handoff places it.
  fabWrap: { position: "absolute", top: -17 },
  fabRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: bio.color.page,
    alignItems: "center",
    justifyContent: "center",
  },
});
