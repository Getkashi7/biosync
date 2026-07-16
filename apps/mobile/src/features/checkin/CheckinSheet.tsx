/**
 * Daily Check-in bottom sheet — the one flow the "Log" tab opens.
 *
 * Built per the Pulse Dashboard RN spec:
 *  - Not an RN <Modal>: an absolute-fill overlay so scrim + sheet share one clock.
 *    Open: translateY 105%→0 · 300ms; scrim 0→0.6 · 240ms. Close mirrors at 260ms.
 *    Scrim tap and a downward pan on the header both dismiss (same shared value).
 *  - Inputs: sleep-hours slider (0–12, 0.5h), sleep-quality emoji, energy dots,
 *    mood emoji, optional weight (kg/lb). Selection haptics on every pick.
 *  - Save: bottom-anchored gradient CTA. On success → checkmark morph + streak,
 *    success haptic, auto-dismiss ~1.2s later.
 *  - Only the weight field summons a keyboard → KeyboardAvoidingView (padding on
 *    iOS, adjustResize on Android) + keyboardShouldPersistTaps="handled".
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
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
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmojiScale } from "../../ui/EmojiScale";
import { EnergyDots } from "../../ui/EnergyDots";
import { GradientButton } from "../../ui/GradientButton";
import { GradientText } from "../../ui/GradientText";
import { GradientSlider } from "../../ui/GradientSlider";
import { SuccessCheck } from "../../ui/SuccessCheck";
import { errorHaptic, selectionHaptic, successHaptic } from "../../lib/haptics";
import { prettyToday } from "../../lib/date";
import { color, motion, radius, size, space, type } from "../../ui/theme";
import { todayLocal, type CheckinInput } from "./checkinApi";

const QUALITY_EMOJI = ["\u{1F634}", "\u{1F62A}", "\u{1F610}", "\u{1F642}", "\u{1F929}"] as const; // 😴 😪 😐 🙂 🤩
const QUALITY_LABELS = ["Terrible", "Poor", "Okay", "Good", "Great"] as const;
const MOOD_EMOJI = ["\u{1F61E}", "\u{1F615}", "\u{1F610}", "\u{1F642}", "\u{1F604}"] as const; // 😞 😕 😐 🙂 😄
const MOOD_LABELS = ["Awful", "Low", "Neutral", "Good", "Great"] as const;

const LB_PER_KG = 2.2046226218;

type Props = {
  /** unmount the sheet (called after the close animation finishes) */
  onClose: () => void;
  /** persist the check-in and resolve with the resulting streak */
  onSubmit: (input: CheckinInput) => Promise<number>;
};

export function CheckinSheet({ onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();

  const [sleepH, setSleepH] = useState(7.5);
  const [quality, setQuality] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [weightOpen, setWeightOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [streak, setStreak] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canSave = quality !== null && energy !== null && mood !== null && status !== "saving";

  // ── open / close animation ──
  const sheetP = useSharedValue(0); // 0 = fully below, 1 = open
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
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

  // Downward pan on the header drags the sheet; past a threshold it dismisses.
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

  // ── save ──
  const buildInput = (): CheckinInput => {
    let weightKg: number | null = null;
    if (weightOpen && weight.trim()) {
      const n = parseFloat(weight);
      if (Number.isFinite(n) && n > 0) {
        weightKg = Math.round((unit === "kg" ? n : n / LB_PER_KG) * 10) / 10;
      }
    }
    return {
      date: todayLocal(),
      sleepHours: sleepH,
      // stored 1–5; UI indices are 0-based
      sleepQuality: (quality ?? 0) + 1,
      energy: (energy ?? 0) + 1,
      mood: (mood ?? 0) + 1,
      weightKg,
    };
  };

  const onSave = async () => {
    if (!canSave || status === "success") return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      const newStreak = await onSubmit(buildInput());
      setStreak(newStreak);
      setStatus("success");
      successHaptic();
      doneTimer.current = setTimeout(close, motion.duration.successHold);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Couldn’t save your check-in. Try again.");
      errorHaptic();
    }
  };

  const toggleUnit = (next: "kg" | "lb") => {
    if (next === unit) return;
    selectionHaptic();
    setUnit(next);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { top: insets.top + size.sheetTopInset }, sheetStyle]}
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.header}>
            <View style={styles.grabber} />
            <Text style={styles.title}>Daily check-in</Text>
            <Text style={styles.date}>{prettyToday()}</Text>
          </View>
        </GestureDetector>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Section label="HOURS SLEPT">
              <GradientSlider value={sleepH} onChange={setSleepH} min={0} max={12} step={0.5} unit="h" />
            </Section>

            <Section label="SLEEP QUALITY">
              <EmojiScale emojis={QUALITY_EMOJI} labels={QUALITY_LABELS} value={quality} onChange={setQuality} />
            </Section>

            <Section label="ENERGY">
              <EnergyDots value={energy} onChange={setEnergy} />
            </Section>

            <Section label="MOOD">
              <EmojiScale emojis={MOOD_EMOJI} labels={MOOD_LABELS} value={mood} onChange={setMood} />
            </Section>

            <Section label="WEIGHT">
              {!weightOpen ? (
                <Pressable
                  style={styles.addWeight}
                  onPress={() => {
                    selectionHaptic();
                    setWeightOpen(true);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.addWeightPlus}>+</Text>
                  <Text style={styles.addWeightText}>Add weight (optional)</Text>
                </Pressable>
              ) : (
                <View style={styles.weightRow}>
                  <View style={styles.weightInputWrap}>
                    <TextInput
                      style={styles.weightInput}
                      value={weight}
                      onChangeText={(t) => setWeight(t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={color.textLabel}
                      selectionColor={color.caret}
                      maxLength={6}
                      returnKeyType="done"
                      autoFocus
                    />
                  </View>
                  <View style={styles.unitToggle}>
                    {(["kg", "lb"] as const).map((u) => {
                      const on = unit === u;
                      return (
                        <Pressable
                          key={u}
                          onPress={() => toggleUnit(u)}
                          style={[styles.unitOption, on && styles.unitOptionOn]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.unitText, on && styles.unitTextOn]}>{u}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </Section>

            {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
          </ScrollView>

          <View style={[styles.saveBar, { paddingBottom: insets.bottom + space.base - 2 }]}>
            <View style={{ opacity: canSave ? 1 : 0.45 }}>
              <GradientButton
                label="Save check-in"
                onPress={onSave}
                loading={status === "saving"}
                disabled={!canSave}
              />
            </View>
          </View>
        </KeyboardAvoidingView>

        {status === "success" ? <SuccessOverlay streak={streak} /> : null}
      </Animated.View>
    </View>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** Fade + rise a child in after `delay` ms (success text lines). */
function FadeUp({ delay, children, style }: { delay: number; children: ReactNode; style?: object }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 260, easing: motion.easeOut }));
  }, [delay, p]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: 8 * (1 - p.value) }],
  }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

function SuccessOverlay({ streak }: { streak: number }) {
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
      <SuccessCheck diameter={96} />
      <FadeUp delay={motion.duration.successTextDelay1} style={styles.successTitleWrap}>
        <Text style={styles.successTitle}>Check-in saved</Text>
      </FadeUp>
      <FadeUp delay={motion.duration.successTextDelay2} style={styles.streakWrap}>
        <View style={styles.streakLine}>
          <Text style={styles.streakLabel}>Streak: </Text>
          <GradientText style={styles.streakNumber}>{String(streak)}</GradientText>
          <Text style={styles.streakLabel}> {streak === 1 ? "day" : "days"} 🔥</Text>
        </View>
      </FadeUp>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    paddingTop: space.md,
    paddingHorizontal: size.screenPadX,
    paddingBottom: space.base,
  },
  grabber: {
    width: size.grabberW,
    height: size.grabberH,
    borderRadius: size.grabberH,
    backgroundColor: color.border,
  },
  title: {
    ...type.sheetTitle,
    color: color.text,
    marginTop: space.base,
    alignSelf: "flex-start",
  },
  date: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: space.xs,
    alignSelf: "flex-start",
  },
  scrollContent: {
    paddingHorizontal: size.screenPadX,
    paddingBottom: space.lg,
  },
  section: {
    marginTop: space.lg,
  },
  sectionLabel: {
    ...type.sectionLabel,
    color: color.textFaint,
    marginBottom: space.md,
  },
  addWeight: {
    flexDirection: "row",
    alignItems: "center",
    height: size.touchTarget,
    gap: space.sm,
  },
  addWeightPlus: {
    ...type.greeting,
    color: color.blue2,
  },
  addWeightText: {
    ...type.body,
    color: color.textSecondary,
  },
  weightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  weightInputWrap: {
    flex: 1,
    height: size.touchTarget,
    borderRadius: radius.emoji,
    borderWidth: 1,
    borderColor: color.optBorder,
    backgroundColor: color.inset,
    justifyContent: "center",
    paddingHorizontal: space.base,
  },
  weightInput: {
    ...type.input,
    color: color.text,
    padding: 0,
  },
  unitToggle: {
    flexDirection: "row",
    height: size.touchTarget,
    borderRadius: radius.emoji,
    borderWidth: 1,
    borderColor: color.optBorder,
    backgroundColor: color.inset,
    overflow: "hidden",
  },
  unitOption: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  unitOptionOn: {
    backgroundColor: color.emojiSelectedBg,
  },
  unitText: {
    ...type.caption,
    color: color.textSecondary,
  },
  unitTextOn: {
    color: color.text,
  },
  error: {
    ...type.caption,
    color: color.error,
    marginTop: space.base,
  },
  saveBar: {
    paddingHorizontal: size.screenPadX,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    backgroundColor: color.surface,
  },
  success: {
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: size.ctaHeight,
  },
  successTitleWrap: {
    marginTop: space.lg,
  },
  successTitle: {
    ...type.sheetTitle,
    color: color.text,
    textAlign: "center",
  },
  streakWrap: {
    marginTop: space.sm,
  },
  streakLine: {
    flexDirection: "row",
    alignItems: "center",
  },
  streakLabel: {
    ...type.body,
    color: color.textSecondary,
  },
  streakNumber: {
    ...type.greeting,
  },
});
