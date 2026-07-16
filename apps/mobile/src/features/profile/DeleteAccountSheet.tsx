/**
 * Delete-account confirm sheet, per the "Pulse Profile" design (frame 2).
 * Real deletion ships with the Week-3 store-compliance work — until then the
 * destructive action explains that instead of pretending to delete: tapping it
 * shows an honest note rather than signing the user out with their data intact.
 */
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientButton } from "../../ui/GradientButton";
import { errorHaptic, pressHaptic } from "../../lib/haptics";
import { color, motion, radius, size, space, type } from "../../ui/theme";

type Props = {
  /** unmount the sheet (called after the close animation finishes) */
  onClose: () => void;
};

export function DeleteAccountSheet({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState(false);

  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(
      0,
      { duration: motion.duration.sheetClose, easing: motion.easeOut },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [onClose, scrimP, sheetP]);

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

  const onDelete = () => {
    errorHaptic();
    setNotice(true);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom }, sheetStyle]}
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
      >
        <View style={styles.grabber} />
        <Text style={styles.title}>Delete your account?</Text>
        <Text style={styles.body}>
          This permanently removes your account and all your health data. This can’t be undone.
        </Text>

        <DestructiveButton label="Delete account" onPress={onDelete} />
        {notice ? (
          <Text style={styles.notice}>
            Account deletion is coming in an update before launch. Nothing was deleted.
          </Text>
        ) : null}
        <View style={styles.cancel}>
          <GradientButton label="Cancel" variant="ghost" onPress={close} />
        </View>
      </Animated.View>
    </View>
  );
}

/** Error-tinted CTA (frame 2's destructive button) with the standard press feel. */
function DestructiveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={styles.destructive}
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
      >
        <Text style={styles.destructiveText}>{label}</Text>
      </Pressable>
    </Animated.View>
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
  body: {
    ...type.body,
    color: color.textSecondary,
    marginTop: space.sm,
  },
  destructive: {
    marginTop: space.lg,
    height: size.ctaHeight,
    borderRadius: radius.cta,
    backgroundColor: color.errorBg,
    borderWidth: 1,
    borderColor: color.errorBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  destructiveText: {
    ...type.button,
    color: color.error,
  },
  notice: {
    ...type.caption,
    color: color.textTertiary,
    textAlign: "center",
    marginTop: space.md,
  },
  cancel: {
    marginTop: space.md,
  },
});
