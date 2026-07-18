/**
 * Daily check-in — BIOSYNC redesign, the light lavender "moment". A Doto sleep
 * clock with a draggable ruler, energy segments, and mood orbs; a dark Save CTA
 * with a success morph. Subjective only (sleep/energy/mood) per the design —
 * sleep quality is derived from hours; weight lives in Quick Log now.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SuccessCheck } from "../../ui/SuccessCheck";
import { errorHaptic, selectionHaptic, successHaptic } from "../../lib/haptics";
import { ENERGY_WORDS, MOOD_WORDS } from "../../lib/ratings";
import { bio, fontFamily, motion } from "../../ui/theme";
import { todayLocal, type CheckinInput } from "./checkinApi";

const INK = bio.color.onLilac;
const ink = (a: number): string => `rgba(34,28,51,${a})`;
const MOOD_HUES = [bio.color.coral, bio.color.amber, bio.color.violet, bio.color.blue, bio.color.teal];

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateLine = (d = new Date()): string => `${WD[d.getDay()]} · ${MO[d.getMonth()]} ${d.getDate()}`;

function fmtDuration(h: number): string {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  return `${hr}h ${String(m).padStart(2, "0")}m`;
}
/** derive a 1–5 sleep-quality proxy from hours (design drops the explicit input) */
const qualityFromHours = (h: number): number => Math.max(1, Math.min(5, Math.round(h / 2)));

type Props = { onClose: () => void; onSubmit: (input: CheckinInput) => Promise<number | null> };

export function CheckinSheet({ onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();
  const [sleepH, setSleepH] = useState(7.5);
  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [streak, setStreak] = useState<number | null>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canSave = energy !== null && mood !== null && status !== "saving";

  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut }, (f) => {
      if (f) runOnJS(onClose)();
    });
  }, [onClose, scrimP, sheetP]);

  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  const onSheetLayout = (h: number) => {
    sheetH.value = h;
    if (!opened.current && h > 0) {
      opened.current = true;
      sheetP.value = withTiming(1, { duration: motion.duration.sheetOpen, easing: motion.easeOut });
      scrimP.value = withTiming(1, { duration: motion.duration.sheetScrim, easing: motion.easeOut });
    }
  };
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 900) }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  // ── sleep ruler ──
  const [rulerW, setRulerW] = useState(1);
  const lastSleep = useRef(sleepH);
  const setFromX = useCallback(
    (x: number) => {
      const pct = Math.max(0, Math.min(1, x / Math.max(1, rulerW)));
      const val = Math.round((pct * 12) / 0.5) * 0.5;
      if (val !== lastSleep.current) {
        lastSleep.current = val;
        selectionHaptic();
        setSleepH(val);
      }
    },
    [rulerW],
  );
  const rulerPan = Gesture.Pan()
    .onBegin((e) => runOnJS(setFromX)(e.x))
    .onUpdate((e) => runOnJS(setFromX)(e.x));

  const pick = (setter: (n: number) => void, v: number) => {
    selectionHaptic();
    setter(v);
  };

  const onSave = async () => {
    if (!canSave || status === "success") return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      const s = await onSubmit({
        date: todayLocal(),
        sleepHours: sleepH,
        sleepQuality: qualityFromHours(sleepH),
        energy: (energy ?? 0) + 1,
        mood: (mood ?? 0) + 1,
        weightKg: null,
      });
      setStreak(s);
      setStatus("success");
      successHaptic();
      doneTimer.current = setTimeout(close, motion.duration.successHold);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Couldn’t save your check-in. Try again.");
      errorHaptic();
    }
  };

  const sleepPct = (sleepH / 12) * 100;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }, sheetStyle]} onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}>
        <View style={styles.grabber} />
        <View style={styles.headRow}>
          <Text style={styles.title}>Daily check-in</Text>
          <Text style={styles.date}>{dateLine()}</Text>
        </View>

        <Text style={styles.label}>How did you sleep?</Text>
        <View style={styles.clockWrap}>
          <Text style={styles.clock}>{fmtDuration(sleepH)}</Text>
          <Text style={styles.clockSub}>hours asleep</Text>
        </View>
        <GestureDetector gesture={rulerPan}>
          <View style={styles.ruler} onLayout={(e) => setRulerW(e.nativeEvent.layout.width)}>
            <View style={styles.tickRow} pointerEvents="none">
              {Array.from({ length: 25 }).map((_, i) => (
                <View key={i} style={[styles.tick, i % 5 === 0 && styles.tickTall]} />
              ))}
            </View>
            <View style={[styles.thumb, { left: `${sleepPct}%` }]} />
          </View>
        </GestureDetector>
        <View style={styles.rulerLabels}>
          {["4h", "6h", "8h", "10h"].map((t) => (
            <Text key={t} style={styles.rulerTick}>{t}</Text>
          ))}
        </View>

        <Text style={[styles.label, styles.gap]}>Energy</Text>
        <View style={styles.segRow}>
          {ENERGY_WORDS.map((w, i) => {
            const on = energy === i;
            return (
              <Pressable key={i} onPress={() => pick(setEnergy, i)} style={[styles.seg, on && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Text style={[styles.segTxt, on && styles.segTxtOn]}>{w}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, styles.gap]}>Mood</Text>
        <View style={styles.moodRow}>
          {MOOD_WORDS.map((w, i) => {
            const on = mood === i;
            return (
              <Pressable key={i} onPress={() => pick(setMood, i)} style={styles.moodCol} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <View style={[styles.orb, { backgroundColor: MOOD_HUES[i], shadowColor: MOOD_HUES[i] }, on ? styles.orbOn : styles.orbOff]} />
                <Text style={[styles.moodTxt, on && styles.moodTxtOn]}>{w}</Text>
              </Pressable>
            );
          })}
        </View>

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        <Pressable style={[styles.save, !canSave && styles.saveOff]} onPress={onSave} disabled={!canSave} accessibilityRole="button">
          <Text style={styles.saveTxt}>{status === "saving" ? "Saving…" : "Save check-in"}</Text>
        </Pressable>
        <Pressable onPress={close} style={styles.skip} accessibilityRole="button">
          <Text style={styles.skipTxt}>Skip today</Text>
        </Pressable>

        {status === "success" ? <SuccessOverlay streak={streak} /> : null}
      </Animated.View>
    </View>
  );
}

function SuccessOverlay({ streak }: { streak: number | null }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: motion.duration.successOverlay, easing: motion.easeOut });
  }, [p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.7 + 0.3 * p.value }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.success, style]}>
      <SuccessCheck diameter={92} />
      <Animated.Text style={[styles.successTitle, textStyle]}>Check-in saved</Animated.Text>
      {streak !== null ? <Animated.Text style={[styles.successStreak, textStyle]}>{streak} {streak === 1 ? "day" : "days"} 🔥</Animated.Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: bio.color.lilac,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: ink(0.2), alignSelf: "center" },
  headRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 20 },
  title: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: INK },
  date: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.4, color: ink(0.45), textTransform: "uppercase" },
  label: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.6, color: ink(0.45), textTransform: "uppercase", marginTop: 24 },
  gap: { marginTop: 28 },
  clockWrap: { alignItems: "center", marginTop: 6 },
  clock: { fontFamily: fontFamily.dot, fontSize: 56, letterSpacing: 4, color: INK, textShadowColor: "rgba(124,86,255,0.3)", textShadowRadius: 20, textShadowOffset: { width: 0, height: 0 } },
  clockSub: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 2, color: ink(0.5), textTransform: "uppercase", marginTop: -2 },
  ruler: { height: 44, marginTop: 14, justifyContent: "center" },
  tickRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tick: { width: 1.5, height: 12, borderRadius: 1, backgroundColor: ink(0.22) },
  tickTall: { height: 22, backgroundColor: ink(0.35) },
  thumb: { position: "absolute", top: 6, width: 3, height: 32, borderRadius: 2, backgroundColor: bio.color.purple, marginLeft: -1.5, shadowColor: bio.color.purple, shadowRadius: 10, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 } },
  rulerLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  rulerTick: { fontFamily: fontFamily.semibold, fontSize: 10, color: ink(0.4) },
  segRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  seg: { flex: 1, height: 40, borderRadius: 12, backgroundColor: "rgba(34,28,51,0.06)", borderWidth: 1, borderColor: ink(0.12), alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: INK, borderColor: INK },
  segTxt: { fontFamily: fontFamily.semibold, fontSize: 11, color: ink(0.6), textAlign: "center" },
  segTxtOn: { color: bio.color.lilac },
  moodRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingHorizontal: 4 },
  moodCol: { alignItems: "center", gap: 8 },
  orb: { width: 34, height: 34, borderRadius: 17, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  orbOn: { shadowOpacity: 0.9, transform: [{ scale: 1.12 }] },
  orbOff: { shadowOpacity: 0, opacity: 0.5 },
  moodTxt: { fontFamily: fontFamily.medium, fontSize: 11, color: ink(0.45) },
  moodTxtOn: { color: INK, fontFamily: fontFamily.semibold },
  error: { fontFamily: fontFamily.regular, fontSize: 13, color: "#B0324B", marginTop: 16 },
  save: { height: 56, borderRadius: 999, backgroundColor: INK, alignItems: "center", justifyContent: "center", marginTop: 28 },
  saveOff: { opacity: 0.4 },
  saveTxt: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.lilac },
  skip: { alignItems: "center", paddingVertical: 14 },
  skipTxt: { fontFamily: fontFamily.medium, fontSize: 13, color: ink(0.5) },
  success: { backgroundColor: bio.color.lilac, alignItems: "center", justifyContent: "center", gap: 12 },
  successTitle: { fontFamily: fontFamily.bold, fontSize: 24, color: INK },
  successStreak: { fontFamily: fontFamily.semibold, fontSize: 15, color: ink(0.6) },
});
