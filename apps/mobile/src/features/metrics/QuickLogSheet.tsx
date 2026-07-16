/**
 * Quick Log bottom sheet — the objective point metrics the daily check-in
 * doesn't cover. Built to the "Pulse Log Sheets" design handoff.
 *
 *  - Same chrome and clock as CheckinSheet (absolute-fill overlay so scrim and
 *    sheet share one animation; header pan and scrim tap both dismiss), but
 *    content-hugging: the sheet is as tall as its content plus the design's
 *    breathing gap, so it lands where the mockup does and still adapts.
 *  - Every field is optional; Save enables as soon as one has a value, and each
 *    filled field becomes its own reading.
 *  - Save → gradient checkmark + "Saved", success haptic, auto-dismiss ~1.2s.
 *  - The numeric fields summon a keyboard, which can leave less room than the
 *    sheet wants: it is capped at the window height and the fields scroll, so
 *    Save stays reachable instead of being pushed off.
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
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientButton } from "../../ui/GradientButton";
import { SuccessCheck } from "../../ui/SuccessCheck";
import { errorHaptic, selectionHaptic, successHaptic } from "../../lib/haptics";
import { prettyToday } from "../../lib/date";
import { getUnitPref } from "../../lib/prefs";
import { color, motion, radius, size, space, type } from "../../ui/theme";
import type { MetricEntry } from "./metricApi";

const LB_PER_KG = 2.2046226218;

type Props = {
  /** unmount the sheet (called after the close animation finishes) */
  onClose: () => void;
  /** persist the filled readings */
  onSubmit: (entries: MetricEntry[]) => Promise<number>;
};

/** A field's text → a number, or null when blank/unparseable. */
function parseValue(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function QuickLogSheet({ onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();

  const [hr, setHr] = useState("");
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [hrv, setHrv] = useState("");
  const [glucose, setGlucose] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const buildEntries = useCallback((): MetricEntry[] => {
    const entries: MetricEntry[] = [];
    const hrValue = parseValue(hr);
    if (hrValue !== null) entries.push({ type: "RESTING_HR", value: hrValue });

    const weightValue = parseValue(weight);
    if (weightValue !== null) {
      const kg = unit === "kg" ? weightValue : weightValue / LB_PER_KG;
      entries.push({ type: "WEIGHT", value: Math.round(kg * 10) / 10 });
    }

    const hrvValue = parseValue(hrv);
    if (hrvValue !== null) entries.push({ type: "HRV", value: hrvValue });

    const glucoseValue = parseValue(glucose);
    if (glucoseValue !== null) entries.push({ type: "GLUCOSE", value: glucoseValue });

    return entries;
  }, [glucose, hr, hrv, unit, weight]);

  const canSave = buildEntries().length > 0 && status !== "saving";

  // ── open / close animation ──
  const sheetP = useSharedValue(0); // 0 = fully below, 1 = open
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

  // Start on the user's preferred unit (Profile → Units).
  useEffect(() => {
    void getUnitPref().then(setUnit);
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

  const onSave = async () => {
    if (!canSave || status === "success") return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      await onSubmit(buildEntries());
      setStatus("success");
      successHaptic();
      doneTimer.current = setTimeout(close, motion.duration.successHold);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Couldn’t save. Try again.");
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
        style={[styles.sheet, { paddingBottom: insets.bottom }, sheetStyle]}
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
      >
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.header}>
              <View style={styles.grabber} />
              <Text style={styles.title}>Quick log</Text>
              <Text style={styles.date}>{prettyToday()}</Text>
            </View>
          </GestureDetector>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.fields}>
              <Field label="RESTING HEART RATE">
                <ValueCell value={hr} onChange={setHr} unit="bpm" />
              </Field>

              <Field label="WEIGHT">
                <View style={styles.weightRow}>
                  <View style={styles.weightInput}>
                    <ValueCell value={weight} onChange={setWeight} />
                  </View>
                  <View style={styles.unitToggle}>
                    {(["kg", "lb"] as const).map((u) => {
                      const on = unit === u;
                      return (
                        <Pressable
                          key={u}
                          onPress={() => toggleUnit(u)}
                          style={[
                            styles.unitOption,
                            u === "kg" ? styles.unitOptionLeft : styles.unitOptionRight,
                            on && styles.unitOptionOn,
                            // The cells butt up against each other: drop lb's left
                            // border unless it's the selected (orange) one.
                            u === "lb" && !on && styles.unitOptionNoLeft,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.unitText, on && styles.unitTextOn]}>{u}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </Field>

              <Field label="HRV" optional>
                <ValueCell value={hrv} onChange={setHrv} unit="ms" />
              </Field>

              <Field label="GLUCOSE" optional>
                <ValueCell value={glucose} onChange={setGlucose} unit="mg/dL" />
              </Field>
            </View>

            {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
          </ScrollView>

          <View style={{ opacity: canSave ? 1 : 0.45 }}>
            <GradientButton
              label="Save"
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

function Field({
  label,
  optional = false,
  children,
}: {
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.fieldOptional}> (OPTIONAL)</Text> : null}
      </Text>
      {children}
    </View>
  );
}

/** A bordered numeric cell: the value on the left, an optional unit on the right. */
function ValueCell({
  value,
  onChange,
  unit,
}: {
  value: string;
  onChange: (next: string) => void;
  unit?: string;
}) {
  return (
    <View style={styles.cell}>
      <TextInput
        style={styles.cellInput}
        value={value}
        // digits and a single decimal point only
        onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={color.textPlaceholder}
        selectionColor={color.caret}
        maxLength={6}
        returnKeyType="done"
      />
      {unit ? <Text style={styles.cellUnit}>{unit}</Text> : null}
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
      <Text style={styles.successTitle}>Saved</Text>
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
    // Hugs its content (so it lands where the design does), but never taller
    // than the window — which Android shrinks when the keyboard opens, handing
    // the shrink down to the scroll view below.
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
  scroll: {
    // sizes to content when there's room; shrinks and scrolls when there isn't,
    // so Save stays reachable with the keyboard up
    flexShrink: 1,
  },
  scrollContent: {
    // the design's breathing room between the last field and the CTA — inside
    // the scroll view so it collapses away first when space is tight
    paddingBottom: size.quickLogSaveGap,
  },
  header: {
    // full-width so the pan target spans the sheet, not just the text
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
  date: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: space.xs,
  },
  fields: {
    marginTop: size.metricFieldGap,
    gap: size.metricFieldGap,
  },
  fieldLabel: {
    ...type.sectionLabel,
    color: color.textFaint,
  },
  fieldOptional: {
    color: color.textOptional,
  },
  cell: {
    marginTop: space.sm,
    height: size.touchTarget,
    borderRadius: radius.emoji,
    backgroundColor: color.inset,
    borderWidth: 1,
    borderColor: color.fieldBorder,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: size.metricCellPadX,
  },
  cellInput: {
    ...type.button,
    color: color.text,
    flex: 1,
    padding: 0,
  },
  cellUnit: {
    ...type.caption,
    color: color.textTertiary,
  },
  weightRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: size.fieldGap,
  },
  weightInput: {
    flex: 1,
  },
  unitToggle: {
    flexDirection: "row",
  },
  unitOption: {
    width: size.touchTarget,
    height: size.touchTarget,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.inset,
    borderWidth: 1,
    borderColor: color.fieldBorder,
  },
  unitOptionLeft: {
    borderTopLeftRadius: radius.emoji,
    borderBottomLeftRadius: radius.emoji,
    // keep this cell's border above its neighbour's, per the design
    zIndex: 1,
  },
  unitOptionRight: {
    borderTopRightRadius: radius.emoji,
    borderBottomRightRadius: radius.emoji,
  },
  unitOptionNoLeft: {
    borderLeftWidth: 0,
  },
  unitOptionOn: {
    backgroundColor: color.emojiSelectedBg,
    borderColor: color.emojiSelectedBorder,
  },
  unitText: {
    ...type.caption,
    color: color.textTertiary,
  },
  unitTextOn: {
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
    // leave the grabber uncovered, as in the design
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
