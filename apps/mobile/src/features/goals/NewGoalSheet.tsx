/**
 * New-goal bottom sheet, per the "Pulse Goals" design (frames 2–3). Same
 * chrome and clock as the Quick Log sheet: content-hugging, scrim + slide,
 * header pan dismisses, capped at the window height with the body scrolling
 * when the keyboard squeezes it.
 *
 * One text field + an optional single-select metric chip row (tap the selected
 * chip again to clear it). Create → gradient check + "Goal created", success
 * haptic, auto-dismiss.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientButton } from "../../ui/GradientButton";
import { SuccessCheck } from "../../ui/SuccessCheck";
import { errorHaptic, selectionHaptic, successHaptic } from "../../lib/haptics";
import { METRIC_META } from "../../lib/metricMeta";
import { color, motion, radius, size, space, type } from "../../ui/theme";
import type { NewGoal } from "./goalsApi";

/** Picker chips, in the design's order. */
const PICKER_TYPES = ["RESTING_HR", "WEIGHT", "SLEEP_HOURS", "HRV", "GLUCOSE", "HYDRATION"] as const;
type PickerType = (typeof PICKER_TYPES)[number];

type Props = {
  /** unmount the sheet (called after the close animation finishes) */
  onClose: () => void;
  /** persist the goal */
  onSubmit: (input: NewGoal) => Promise<void>;
};

export function NewGoalSheet({ onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();

  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState<PickerType | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canSave = description.trim().length > 0 && status !== "saving";

  // ── open / close animation (QuickLogSheet's clock) ──
  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  const onSheetLayout = (h: number) => {
    sheetH.value = h;
    if (!opened.current && h > 0) {
      opened.current = true;
      sheetP.value = withTiming(1, { duration: motion.duration.sheetOpen, easing: motion.easeOut });
      scrimP.value = withTiming(1, { duration: motion.duration.sheetScrim, easing: motion.easeOut });
    }
  };

  const settleOpen = useCallback(() => {
    sheetP.value = withSpring(1, motion.pressSpring);
    scrimP.value = withTiming(1, { duration: 180, easing: motion.easeOut });
  }, [scrimP, sheetP]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const dy = Math.max(0, e.translationY);
      const h = sheetH.value > 0 ? sheetH.value : 1;
      const p = 1 - Math.min(dy / h, 1);
      sheetP.value = p;
      scrimP.value = p;
    })
    .onEnd((e) => {
      const h = sheetH.value > 0 ? sheetH.value : 1;
      if (e.translationY > h * 0.25 || e.velocityY > 800) {
        runOnJS(close)();
      } else {
        runOnJS(settleOpen)();
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 900) }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  const pickMetric = (next: PickerType) => {
    selectionHaptic();
    setMetric((current) => (current === next ? null : next));
  };

  const onSave = async () => {
    if (!canSave || status === "success") return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      await onSubmit({ description: description.trim(), targetMetric: metric ?? undefined });
      setStatus("success");
      successHaptic();
      doneTimer.current = setTimeout(close, motion.duration.successHold);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Couldn’t create your goal. Try again.");
      errorHaptic();
    }
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
        <KeyboardAvoidingView
          style={styles.kav}
          behavior="padding"
        >
          <GestureDetector gesture={pan}>
            <View style={styles.header}>
              <View style={styles.grabber} />
              <Text style={styles.title}>New goal</Text>
            </View>
          </GestureDetector>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.field}>
              <TextInput
                style={styles.fieldInput}
                value={description}
                onChangeText={setDescription}
                placeholder="What do you want to work toward?"
                placeholderTextColor={color.textPlaceholder}
                selectionColor={color.caret}
                maxLength={200}
                returnKeyType="done"
              />
            </View>

            <View style={styles.pickerSection}>
              <Text style={styles.pickerLabel}>
                TRACK A METRIC<Text style={styles.pickerOptional}> (OPTIONAL)</Text>
              </Text>
              <View style={styles.chips}>
                {PICKER_TYPES.map((t) => {
                  const on = metric === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => pickMetric(t)}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {METRIC_META[t]?.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
          </ScrollView>

          <View style={{ opacity: canSave ? 1 : 0.45 }}>
            <GradientButton
              label="Create goal"
              onPress={onSave}
              loading={status === "saving"}
              disabled={!canSave}
            />
          </View>
          <View style={styles.divider} />
        </KeyboardAvoidingView>

        {status === "success" ? <SuccessOverlay /> : null}
      </Animated.View>
    </View>
  );
}

function SuccessOverlay() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: motion.duration.successOverlay, easing: motion.easeOut });
  }, [p]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.6 + 0.4 * p.value }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.success, animatedStyle]}>
      <SuccessCheck diameter={size.successCheck} />
      <Text style={styles.successTitle}>Goal created</Text>
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
    maxHeight: "100%",
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderColor: color.hairline,
    paddingTop: size.sheetPadTop,
    paddingHorizontal: size.screenPadX,
  },
  kav: {
    flexShrink: 1,
  },
  header: {
    alignSelf: "stretch",
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
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: size.quickLogSaveGap,
  },
  field: {
    marginTop: space.base,
    height: size.touchTarget,
    borderRadius: radius.emoji,
    backgroundColor: color.inset,
    borderWidth: 1,
    borderColor: color.fieldBorder,
    justifyContent: "center",
    paddingHorizontal: size.metricCellPadX,
  },
  fieldInput: {
    ...type.input,
    color: color.text,
    padding: 0,
  },
  pickerSection: {
    marginTop: size.metricFieldGap,
  },
  pickerLabel: {
    ...type.sectionLabel,
    color: color.textFaint,
  },
  pickerOptional: {
    color: color.textOptional,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: size.hintGap,
  },
  chip: {
    height: size.chip,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.inset,
    borderWidth: 1,
    borderColor: color.optBorder,
    justifyContent: "center",
  },
  chipOn: {
    backgroundColor: color.emojiSelectedBg,
    borderColor: color.emojiSelectedBorder,
  },
  chipText: {
    ...type.captionSm,
    color: color.textStrong,
  },
  chipTextOn: {
    color: color.text,
  },
  error: {
    ...type.caption,
    color: color.error,
    marginTop: space.base,
  },
  divider: {
    height: 1,
    backgroundColor: color.hairline,
    marginTop: size.saveDividerGap,
    marginHorizontal: -size.screenPadX,
  },
  success: {
    top: size.sheetPadTop + size.grabberH,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    ...type.sheetTitle,
    color: color.text,
    marginTop: space.lg,
    textAlign: "center",
  },
});
