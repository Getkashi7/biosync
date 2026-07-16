/**
 * "What do you want to log?" — the sheet the centre Log tab opens. It routes to
 * either the daily check-in or the quick metric log; MainTabs owns what each
 * choice actually does, so this stays presentation-only.
 *
 * Same chrome and clock as CheckinSheet (one absolute-fill overlay so scrim and
 * sheet share an animation), but content-hugging rather than near-full-height.
 * A pick animates the sheet out *before* handing control back, so the next sheet
 * slides up into a clean screen instead of cross-fading with this one.
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
import { pressHaptic } from "../../lib/haptics";
import { color, motion, radius, size, space, type } from "../../ui/theme";

type Props = {
  /** unmount the sheet (called after the close animation finishes) */
  onClose: () => void;
  onCheckin: () => void;
  onQuickLog: () => void;
};

export function LogChooser({ onClose, onCheckin, onQuickLog }: Props) {
  const insets = useSafeAreaInsets();

  const sheetP = useSharedValue(0); // 0 = fully below, 1 = open
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);
  // What to run once the sheet has finished animating out (a pick, or nothing).
  const pending = useRef<(() => void) | null>(null);

  const finish = useCallback(() => {
    onClose();
    const next = pending.current;
    pending.current = null;
    next?.();
  }, [onClose]);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(
      0,
      { duration: motion.duration.sheetClose, easing: motion.easeOut },
      (finished) => {
        if (finished) runOnJS(finish)();
      },
    );
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

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 400) }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + space.xs }, sheetStyle]}
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
      >
        <View style={styles.grabber} />
        <Text style={styles.title}>What do you want to log?</Text>

        <View style={styles.options}>
          <OptionCard
            icon={<CheckinIcon />}
            title="Daily check-in"
            subtitle="Sleep, quality, energy, mood"
            onPress={() => pick(onCheckin)}
          />
          <OptionCard
            icon={<MetricIcon />}
            title="Log a metric"
            subtitle="Resting HR, weight, HRV, glucose"
            onPress={() => pick(onQuickLog)}
          />
        </View>
      </Animated.View>
    </View>
  );
}

function OptionCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={styles.card}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(motion.pressScale, {
            duration: motion.duration.press,
            easing: motion.easeOut,
          });
          pressHaptic();
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.pressSpring);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${subtitle}`}
      >
        {icon}
        <View>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Clipboard with a tick — the daily check-in. */
function CheckinIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={4} width={14} height={17} rx={3} stroke={color.iconStrong} strokeWidth={2} />
      <Path d="M9 2.5 H15 V6 H9 Z" stroke={color.iconStrong} strokeWidth={2} strokeLinejoin="round" />
      <Path
        d="M9 13.5 L11.2 15.7 L15.5 11"
        stroke={color.iconStrong}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** ECG trace — a point measurement. */
function MetricIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.5 12.5 H7 L9.8 5.5 L13.8 19 L16.5 12.5 H21.5"
        stroke={color.iconStrong}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: color.scrim,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderColor: color.hairline,
    paddingTop: size.sheetPadTop,
    paddingHorizontal: size.screenPadX,
  },
  grabber: {
    width: size.grabberW,
    height: size.grabberH,
    borderRadius: size.grabberH,
    backgroundColor: color.border,
    alignSelf: "center",
  },
  title: {
    ...type.sheetTitle,
    color: color.text,
    marginTop: size.sheetTitleGap,
  },
  options: {
    marginTop: space.base,
    gap: space.md,
  },
  card: {
    height: size.chooserCard,
    borderRadius: radius.card,
    backgroundColor: color.inset,
    borderWidth: 1,
    borderColor: color.optBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: size.chooserIconGap,
    paddingHorizontal: space.base,
  },
  cardTitle: {
    ...type.cardTitle,
    color: color.text,
  },
  cardSubtitle: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: space.xxs,
  },
});
