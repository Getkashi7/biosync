/**
 * Add a meal (design 2A/2B) — the peach "moment": light canvas, calm, single
 * purpose. The user describes a meal in one line, the coach estimates the
 * macros, and nothing is written until they confirm.
 *
 * Stages: compose → estimating (pulsing dots on the CTA) → estimated (the parsed
 * items + editable Doto macro chips) → save (toast, back to compose). Every
 * number stays editable, and if the coach can't be reached the sheet falls back
 * to plain manual entry rather than blocking the log.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { bio, fontFamily, motion } from "../../ui/theme";
import { pressHaptic, successHaptic } from "../../lib/haptics";
import { dateLabel } from "../../lib/format";
import { estimateMeal, logMeal, type MacroEstimate } from "./nutritionApi";

const RECENTS = [
  "Oats, berries + almond butter",
  "Chicken salad + rice",
  "Greek yogurt + honey",
  "Protein shake",
] as const;

type Stage = "compose" | "estimating" | "estimated";

/** the four editable macro chips, in the design's order */
type ChipKey = "calories" | "proteinG" | "carbsG" | "fatG";
const CHIPS: { key: ChipKey; label: string; unit: string }[] = [
  { key: "calories", label: "kcal", unit: "" },
  { key: "proteinG", label: "protein", unit: "g" },
  { key: "carbsG", label: "carbs", unit: "g" },
  { key: "fatG", label: "fat", unit: "g" },
];

export function AddMealSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>("compose");
  const [text, setText] = useState("");
  const [estimate, setEstimate] = useState<MacroEstimate | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [edited, setEdited] = useState(false);
  const [toast, setToast] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);

  const close = useCallback(() => {
    Keyboard.dismiss();
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut }, (f) => {
      if (f) runOnJS(onClose)();
    });
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
    transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 640) }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const runEstimate = useCallback(async () => {
    const description = text.trim();
    if (!description) return;
    Keyboard.dismiss();
    pressHaptic();
    setStage("estimating");
    setNotice(null);
    try {
      const result = await estimateMeal(description);
      if (result) {
        setEstimate(result);
        setItems(result.items ?? []);
        setEdited(false);
        setStage("estimated");
      } else {
        // Coach off or unusable output — let them enter the numbers by hand.
        setEstimate({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
        setItems([]);
        setEdited(true);
        setNotice("Couldn’t reach the coach — enter the numbers yourself.");
        setStage("estimated");
      }
    } catch {
      setEstimate({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
      setItems([]);
      setEdited(true);
      setNotice("Couldn’t reach the coach — enter the numbers yourself.");
      setStage("estimated");
    }
  }, [text]);

  const save = useCallback(async () => {
    if (!estimate) return;
    pressHaptic();
    try {
      await logMeal({
        description: text.trim(),
        calories: Math.round(estimate.calories),
        proteinG: estimate.proteinG,
        carbsG: estimate.carbsG,
        fatG: estimate.fatG,
        fiberG: estimate.fiberG ?? null,
        estimated: !edited,
      });
      successHaptic();
      setToast(true);
      setStage("compose");
      setText("");
      setEstimate(null);
      setItems([]);
      setNotice(null);
      onSaved();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(false), 1700);
    } catch {
      setNotice("Couldn’t save that meal — try again.");
    }
  }, [estimate, text, edited, onSaved]);

  const setChip = (key: ChipKey, raw: string) => {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n)) return;
    setEstimate((e) => (e ? { ...e, [key]: key === "calories" ? Math.round(n) : n } : e));
    setEdited(true);
  };

  const isEstimated = stage === "estimated";
  const isEstimating = stage === "estimating";
  const ctaDisabled = isEstimating || (!isEstimated && !text.trim());

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 20 }, sheetStyle]}
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
      >
        <AuroraField
          blobs={[
            { hue: "224,150,54", size: 440, cx: true, top: 60, stops: [{ o: 0, a: 0.45 }, { o: 46, a: 0.2 }, { o: 72, a: 0 }] },
            { hue: bio.aurora.coral, size: 300, right: -110, bottom: -40, stops: [{ o: 0, a: 0.24 }, { o: 70, a: 0 }], variant: "b", delayMs: -5000 },
          ]}
        />

        {toast ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>Saved — today updated</Text>
          </View>
        ) : null}

        <KeyboardAvoidingView behavior="padding">
          <View style={styles.grabber} />

          <View style={styles.head}>
            <Text style={styles.title}>Add a meal</Text>
            <Text style={styles.headDate}>{dateLabel().toUpperCase()}</Text>
          </View>
          <Text style={styles.sub}>Tell the coach in one line — it does the numbers.</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>WHAT DID YOU EAT?</Text>
            <View style={styles.field}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={'Describe what you ate… "2 eggs, toast, black coffee"'}
                placeholderTextColor={bio.peachAlpha(0.38)}
                style={styles.input}
                multiline
                numberOfLines={3}
                editable={!isEstimating}
              />
            </View>

            {!isEstimated ? (
              <>
                <Text style={styles.label}>RECENT</Text>
                <View style={styles.recents}>
                  {RECENTS.map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => {
                        pressHaptic();
                        setText(r);
                      }}
                      style={({ pressed }) => [styles.recent, pressed && styles.pressed]}
                    >
                      <Text style={styles.recentText}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : estimate ? (
              <View style={styles.estimateCard}>
                <View style={styles.estHead}>
                  <View style={styles.estFam}>
                    <View style={styles.estDot} />
                    <Text style={styles.estLabel}>COACH ESTIMATE</Text>
                  </View>
                  <View style={styles.confRow}>
                    {[0, 1, 2, 3].map((i) => (
                      <View key={i} style={[styles.confDot, i < 3 ? styles.confOn : styles.confOff]} />
                    ))}
                  </View>
                </View>

                {items.length > 0 ? (
                  <View style={styles.items}>
                    {items.map((it, i) => (
                      <View key={i} style={styles.itemRow}>
                        <View style={styles.itemBullet} />
                        <Text style={styles.itemName}>{it}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.divider} />

                <View style={styles.chips}>
                  {CHIPS.map((c) => (
                    <View key={c.key} style={styles.chip}>
                      <Text style={styles.chipLabel}>{c.label.toUpperCase()}</Text>
                      <View style={styles.chipValueRow}>
                        <TextInput
                          value={String(estimate[c.key] ?? 0)}
                          onChangeText={(v) => setChip(c.key, v)}
                          keyboardType="numeric"
                          style={styles.chipValue}
                          selectTextOnFocus
                        />
                        {c.unit ? <Text style={styles.chipUnit}>{c.unit}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
                <Text style={styles.chipHint}>Tap a value to adjust</Text>
              </View>
            ) : null}

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          </ScrollView>

          <Pressable
            onPress={() => void (isEstimated ? save() : runEstimate())}
            disabled={ctaDisabled}
            style={({ pressed }) => [styles.cta, ctaDisabled && styles.ctaDim, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            {isEstimating ? (
              <View style={styles.dots}>
                <PulseDot delay={0} />
                <PulseDot delay={180} />
                <PulseDot delay={360} />
              </View>
            ) : (
              <Text style={styles.ctaText}>{isEstimated ? "Save to today" : "Estimate"}</Text>
            )}
          </Pressable>

          <Text style={styles.ctaNote}>AI estimate — adjust anytime</Text>
          <View style={styles.disclaimerRow}>
            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>Wellness guidance, not medical advice</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

function PulseDot({ delay }: { delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 550, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [v, delay]);
  const style = useAnimatedStyle(() => ({ opacity: interpolate(v.value, [0, 1], [0.5, 0.95]) }));
  return <Animated.View style={[styles.dot, style]} />;
}

const INK = bio.color.onPeach;

const styles = StyleSheet.create({
  scrim: { backgroundColor: bio.color.scrim },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "94%",
    backgroundColor: bio.color.peach,
    borderTopLeftRadius: bio.radius.sheet,
    borderTopRightRadius: bio.radius.sheet,
    paddingTop: 10,
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: bio.peachAlpha(0.2), alignSelf: "center" },

  toast: {
    position: "absolute",
    alignSelf: "center",
    top: 18,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: bio.radius.pill,
    backgroundColor: INK,
    zIndex: 40,
  },
  toastText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.color.peachText },

  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 22 },
  title: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: INK },
  headDate: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.5, color: bio.peachAlpha(0.45) },
  sub: { fontFamily: fontFamily.light, fontSize: 13, color: bio.peachAlpha(0.55), marginTop: 6 },

  scroll: { marginTop: 4 },
  scrollContent: { paddingBottom: 8 },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.peachAlpha(0.45),
    marginTop: 20,
  },
  field: {
    borderRadius: bio.radius.card,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  input: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 22,
    color: INK,
    minHeight: 66,
    textAlignVertical: "top",
    padding: 0,
  },

  recents: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  recent: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: bio.radius.pill,
    backgroundColor: "rgba(255,255,255,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
  recentText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.peachAlpha(0.75) },

  estimateCard: {
    borderRadius: bio.radius.card,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    padding: 18,
    marginTop: 18,
  },
  estHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  estFam: { flexDirection: "row", alignItems: "center", gap: 8 },
  estDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: bio.color.amberInk,
    shadowColor: bio.color.amberInk,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  estLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, letterSpacing: 1.26, color: bio.color.amberInkText },
  confRow: { flexDirection: "row", gap: 4 },
  confDot: { width: 5, height: 5, borderRadius: 2.5 },
  confOn: { backgroundColor: bio.peachAlpha(0.85) },
  confOff: { backgroundColor: bio.peachAlpha(0.2) },

  items: { gap: 9, marginTop: 14 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemBullet: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: bio.color.amberInk },
  itemName: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: INK },

  divider: { height: 1, backgroundColor: bio.peachAlpha(0.1), marginTop: 14 },

  chips: { flexDirection: "row", gap: 8, marginTop: 14 },
  chip: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 16,
    backgroundColor: bio.peachAlpha(0.06),
    borderWidth: 1,
    borderColor: bio.peachAlpha(0.1),
  },
  chipLabel: { fontFamily: fontFamily.bold, fontSize: 9, letterSpacing: 1.08, color: bio.peachAlpha(0.5) },
  chipValueRow: { flexDirection: "row", alignItems: "baseline", gap: 1 },
  chipValue: {
    fontFamily: fontFamily.dot,
    fontSize: 19,
    letterSpacing: 0.6,
    color: INK,
    padding: 0,
    minWidth: 34,
    textAlign: "center",
  },
  chipUnit: { fontFamily: fontFamily.regular, fontSize: 9.5, color: bio.peachAlpha(0.45) },
  chipHint: { fontFamily: fontFamily.regular, fontSize: 10.5, color: bio.peachAlpha(0.45), textAlign: "center", marginTop: 10 },

  notice: { fontFamily: fontFamily.regular, fontSize: 12.5, lineHeight: 18, color: bio.peachAlpha(0.6), marginTop: 12 },

  cta: {
    height: 56,
    borderRadius: bio.radius.pill,
    backgroundColor: INK,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  ctaDim: { opacity: 0.45 },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.peachText },
  dots: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: bio.color.peachText },

  ctaNote: { fontFamily: fontFamily.regular, fontSize: 11.5, color: bio.peachAlpha(0.5), textAlign: "center", marginTop: 12 },
  disclaimerRow: { flexDirection: "row", justifyContent: "center", marginTop: 9 },
  disclaimer: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.peachAlpha(0.07),
    borderWidth: 1,
    borderColor: bio.peachAlpha(0.12),
  },
  disclaimerText: { fontFamily: fontFamily.semibold, fontSize: 9.5, letterSpacing: 0.5, color: bio.peachAlpha(0.55) },

  pressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
});
