/**
 * Add to stack (design 2A) — the pale-rose "moment": calm, light, single
 * purpose. The user logs something they already take, in their own words: a
 * name, their own dose as free text, when they take it, and an optional note.
 *
 * The app contributes nothing here — no suggested dose, no condition, no advice.
 * That's the whole point, and the footer says so.
 */
import { useCallback, useRef, useState } from "react";
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
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { bio, fontFamily, motion } from "../../ui/theme";
import { pressHaptic, selectionHaptic, successHaptic } from "../../lib/haptics";
import { addSupplement, type Timing } from "./supplementsApi";

const SEGMENTS: Timing[] = ["AM", "PRE", "PM"];

export function AddSupplementSheet({
  onClose,
  onSaved,
  seedName,
}: {
  onClose: () => void;
  onSaved: () => void;
  /**
   * Prefilled from a suggestion — the NAME only. Dose and timing stay blank on
   * purpose: those are the user's to write, never the app's to propose.
   */
  seedName?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(seedName ?? "");
  const [dose, setDose] = useState("");
  const [note, setNote] = useState("");
  const [timings, setTimings] = useState<Timing[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 700) }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  const toggleSegment = (t: Timing) => {
    selectionHaptic();
    setTimings((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const canSave = name.trim().length > 0 && dose.trim().length > 0 && timings.length > 0 && !saving;

  const save = useCallback(async () => {
    if (!canSave) return;
    pressHaptic();
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await addSupplement({
        name: name.trim(),
        dose: dose.trim(),
        timings,
        note: note.trim() ? note.trim() : null,
      });
      successHaptic();
      onSaved();
      close();
    } catch {
      setError("Couldn’t add that just now — try again.");
      setSaving(false);
    }
  }, [canSave, name, dose, timings, note, onSaved, close]);

  const INK = bio.color.onRosePale;

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
            { hue: "214,95,168", size: 440, cx: true, top: 40, stops: [{ o: 0, a: 0.4 }, { o: 46, a: 0.18 }, { o: 72, a: 0 }] },
            { hue: bio.aurora.violet, size: 300, left: -110, bottom: -30, stops: [{ o: 0, a: 0.22 }, { o: 70, a: 0 }], variant: "b", delayMs: -5000 },
          ]}
        />

        <KeyboardAvoidingView behavior="padding">
          <View style={styles.grabber} />

          <View style={styles.head}>
            <Text style={[styles.title, { color: INK }]}>Add to stack</Text>
            <Text style={styles.headNote}>YOUR OWN WORDS</Text>
          </View>
          <Text style={styles.sub}>Log something you already take — name it your way.</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>NAME</Text>
            <View style={styles.field}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Magnesium glycinate"
                placeholderTextColor={bio.roseInkAlpha(0.34)}
                style={styles.nameInput}
                editable={!saving}
              />
            </View>

            <Text style={styles.label}>DOSE</Text>
            <View style={styles.field}>
              <TextInput
                value={dose}
                onChangeText={setDose}
                placeholder="2000 IU · 5 g · 1 cap"
                placeholderTextColor={bio.roseInkAlpha(0.34)}
                style={styles.doseInput}
                editable={!saving}
              />
            </View>

            <Text style={styles.label}>WHEN</Text>
            <View style={styles.segments}>
              {SEGMENTS.map((t) => {
                const on = timings.includes(t);
                return (
                  <Pressable
                    key={t}
                    onPress={() => toggleSegment(t)}
                    style={({ pressed }) => [styles.segment, !on && styles.segmentOff, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    {on ? (
                      <LinearGradient
                        colors={[bio.color.magenta, bio.color.magentaDeep]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                    ) : null}
                    <Text style={[styles.segmentText, { color: on ? bio.color.rosePaleText : bio.roseInkAlpha(0.55) }]}>
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>
              WHY I TAKE IT <Text style={styles.optional}>· optional</Text>
            </Text>
            <View style={styles.field}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="A note to your future self…"
                placeholderTextColor={bio.roseInkAlpha(0.34)}
                style={styles.noteInput}
                multiline
                numberOfLines={2}
                editable={!saving}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <Pressable
            onPress={() => void save()}
            disabled={!canSave}
            style={({ pressed }) => [styles.cta, !canSave && styles.ctaDim, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Svg width={15} height={15} viewBox="0 0 15 15" fill="none">
              <Path d="M7.5 0 V15 M0 7.5 H15" stroke={bio.color.rosePaleText} strokeWidth={2.2} strokeLinecap="round" />
            </Svg>
            <Text style={styles.ctaText}>{saving ? "Adding…" : "Add to stack"}</Text>
          </Pressable>

          <Text style={styles.footer}>Your own dose, your own words — BIOSYNC doesn’t prescribe.</Text>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const INK = bio.color.onRosePale;

const styles = StyleSheet.create({
  scrim: { backgroundColor: bio.color.scrim },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "94%",
    backgroundColor: bio.color.rosePale,
    borderTopLeftRadius: bio.radius.sheet,
    borderTopRightRadius: bio.radius.sheet,
    paddingTop: 10,
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: bio.roseInkAlpha(0.2), alignSelf: "center" },

  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 22 },
  title: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24 },
  headNote: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.5, color: bio.roseInkAlpha(0.45) },
  sub: { fontFamily: fontFamily.light, fontSize: 13, color: bio.roseInkAlpha(0.55), marginTop: 6 },

  scroll: { marginTop: 4 },
  scrollContent: { paddingBottom: 8 },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.roseInkAlpha(0.45),
    marginTop: 18,
  },
  optional: { fontFamily: fontFamily.regular, fontSize: 11, letterSpacing: 0, color: bio.roseInkAlpha(0.38) },
  field: {
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 9,
  },
  nameInput: { fontFamily: fontFamily.semibold, fontSize: 15.5, color: INK, padding: 0 },
  doseInput: { fontFamily: fontFamily.dot, fontSize: 16, letterSpacing: 0.5, color: INK, padding: 0 },
  noteInput: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: INK,
    minHeight: 44,
    textAlignVertical: "top",
    padding: 0,
  },

  segments: { flexDirection: "row", gap: 9, marginTop: 9 },
  segment: {
    flex: 1,
    height: 50,
    borderRadius: bio.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  segmentOff: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
  segmentText: { fontFamily: fontFamily.bold, fontSize: 13.5, letterSpacing: 0.8 },

  error: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.roseInkAlpha(0.7), marginTop: 12 },

  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    height: 56,
    borderRadius: bio.radius.pill,
    backgroundColor: INK,
    marginTop: 16,
  },
  ctaDim: { opacity: 0.45 },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.rosePaleText },
  footer: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: bio.roseInkAlpha(0.55),
    textAlign: "center",
    marginTop: 13,
  },

  pressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
});
