/**
 * "What do you want to log?" — the sheet the centre Log FAB opens. Routes to the
 * daily check-in or the quick metric log; MainTabs owns what each choice does.
 * BIOSYNC redesign: dark glass sheet with aurora-accented option cards. A pick
 * animates the sheet out before handing control back.
 */
import { useCallback, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { pressHaptic } from "../../lib/haptics";
import { bio, fontFamily, motion } from "../../ui/theme";

type Props = {
  onClose: () => void;
  onCheckin: () => void;
  onQuickLog: () => void;
};

export function LogChooser({ onClose, onCheckin, onQuickLog }: Props) {
  const insets = useSafeAreaInsets();

  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);
  const pending = useRef<(() => void) | null>(null);

  const finish = useCallback(() => {
    onClose();
    const next = pending.current;
    pending.current = null;
    next?.();
  }, [onClose]);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut }, (finished) => {
      if (finished) runOnJS(finish)();
    });
  }, [finish, scrimP, sheetP]);

  const pick = (action: () => void) => {
    pending.current = action;
    close();
  };

  const onSheetLayout = (h: number) => {
    sheetH.value = h;
    if (!opened.current && h > 0) {
      opened.current = true;
      sheetP.value = withTiming(1, { duration: motion.duration.sheetOpen, easing: motion.easeOut });
      scrimP.value = withTiming(1, { duration: motion.duration.sheetScrim, easing: motion.easeOut });
    }
  };

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 400) }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 8 }, sheetStyle]}
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
      >
        <AuroraField blobs={[{ hue: bio.aurora.violet, size: 320, cx: true, top: -120, stops: [{ o: 0, a: 0.22 }, { o: 70, a: 0 }] }]} />
        <View style={styles.grabber} />
        <Text style={styles.title}>What do you want to log?</Text>

        <View style={styles.options}>
          <OptionCard icon={<CheckinIcon />} hue={bio.color.magenta} title="Daily check-in" subtitle="Sleep, quality, energy, mood" onPress={() => pick(onCheckin)} />
          <OptionCard icon={<MetricIcon />} hue={bio.color.blue} title="Log a metric" subtitle="Resting HR, weight, HRV, glucose" onPress={() => pick(onQuickLog)} />
        </View>
      </Animated.View>
    </View>
  );
}

function OptionCard({ icon, hue, title, subtitle, onPress }: { icon: ReactNode; hue: string; title: string; subtitle: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={styles.card}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(motion.pressScale, { duration: motion.duration.press, easing: motion.easeOut });
          pressHaptic();
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.pressSpring);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${subtitle}`}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${hue}22`, borderColor: `${hue}55` }]}>{icon}</View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function CheckinIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={4} width={14} height={17} rx={3} stroke={bio.color.text} strokeWidth={2} />
      <Path d="M9 2.5 H15 V6 H9 Z" stroke={bio.color.text} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M9 13.5 L11.2 15.7 L15.5 11" stroke={bio.color.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function MetricIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M2.5 12.5 H7 L9.8 5.5 L13.8 19 L16.5 12.5 H21.5" stroke={bio.color.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: bio.color.ink,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: bio.color.border,
    paddingTop: 10,
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: bio.color.border, alignSelf: "center" },
  title: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: bio.color.text, marginTop: 18 },
  options: { marginTop: 18, gap: 12 },
  card: {
    height: 74,
    borderRadius: bio.radius.card,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: bio.color.border2,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.text },
  cardSubtitle: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.alpha(0.5), marginTop: 2 },
});
