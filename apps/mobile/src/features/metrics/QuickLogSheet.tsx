/**
 * Quick log — BIOSYNC redesign. A dark sheet: pick a metric (the aurora bloom
 * re-tints to its hue), dial the value with ± steppers or the ruler, Save.
 * Weight is entered + stored in kg.
 *
 * Dialled values persist across metric switches, so you can set heart rate,
 * flick to weight, set that too, and save everything in one tap — they're
 * stamped with a single `recordedAt`, so one save reads as one moment.
 *
 * Only metrics you actually touched are submitted. That's a data-integrity
 * rule, not a nicety: every metric opens on a plausible default, so saving
 * untouched ones would write readings the user never took, and those numbers
 * would then feed readiness and the trends.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { SuccessCheck } from "../../ui/SuccessCheck";
import { errorHaptic, selectionHaptic, successHaptic } from "../../lib/haptics";
import { bio, fontFamily, motion } from "../../ui/theme";
import type { MetricEntry } from "./metricApi";

type Def = { key: MetricEntry["type"]; label: string; min: number; max: number; step: number; def: number; unit: string; hue: string; rgb: string; decimals: number };
const METRICS: Def[] = [
  { key: "RESTING_HR", label: "Heart rate", min: 40, max: 120, step: 1, def: 60, unit: "bpm", hue: bio.color.coral, rgb: bio.aurora.coral, decimals: 0 },
  { key: "WEIGHT", label: "Weight", min: 40, max: 150, step: 0.5, def: 70, unit: "kg", hue: bio.color.teal, rgb: bio.aurora.teal, decimals: 1 },
  { key: "HRV", label: "HRV", min: 10, max: 150, step: 1, def: 60, unit: "ms", hue: bio.color.blue, rgb: bio.aurora.blue, decimals: 0 },
  { key: "GLUCOSE", label: "Glucose", min: 60, max: 200, step: 1, def: 90, unit: "mg/dL", hue: bio.color.amber, rgb: bio.aurora.amber, decimals: 0 },
];

type Props = { onClose: () => void; onSubmit: (entries: MetricEntry[]) => Promise<number> };

export function QuickLogSheet({ onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(0);
  /** Every metric's dialled value, kept while you move between them. */
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(METRICS.map((d) => [d.key, d.def])),
  );
  /** Only these get saved — see the note above about untouched defaults. */
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const m = METRICS[idx]!;
  const value = values[m.key] ?? m.def;

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
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 800) }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  const pickMetric = (i: number) => {
    if (i === idx) return;
    selectionHaptic();
    const next = METRICS[i]!;
    setIdx(i);
    // Whatever was dialled here before is restored, not reset — that's what
    // makes filling several in one visit possible.
    lastVal.current = values[next.key] ?? next.def;
  };

  /** Record a value and mark the metric as one the user actually set. */
  const commit = useCallback((key: string, v: number) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const clamp = (v: number): number => Math.max(m.min, Math.min(m.max, Math.round(v / m.step) * m.step));
  const step = (dir: number) => {
    selectionHaptic();
    commit(m.key, clamp(value + dir * m.step));
  };

  const [rulerW, setRulerW] = useState(1);
  const lastVal = useRef(value);
  const setFromX = useCallback(
    (x: number) => {
      const pct = Math.max(0, Math.min(1, x / Math.max(1, rulerW)));
      const v = clamp(m.min + pct * (m.max - m.min));
      if (v !== lastVal.current) {
        lastVal.current = v;
        selectionHaptic();
        commit(m.key, v);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rulerW, idx, commit],
  );
  const rulerPan = Gesture.Pan()
    .onBegin((e) => runOnJS(setFromX)(e.x))
    .onUpdate((e) => runOnJS(setFromX)(e.x));

  /** In the order they're shown, so the confirmation matches what you dialled. */
  const pending: MetricEntry[] = METRICS.filter((d) => touched.has(d.key)).map((d) => ({
    type: d.key,
    value: values[d.key] ?? d.def,
  }));

  const onSave = async () => {
    if (status === "saving" || status === "success" || pending.length === 0) return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      await onSubmit(pending);
      setStatus("success");
      successHaptic();
      doneTimer.current = setTimeout(close, motion.duration.successHold);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Couldn’t save. Try again.");
      errorHaptic();
    }
  };

  const saveLabel =
    status === "saving"
      ? "Saving…"
      : pending.length > 1
        ? `Save ${pending.length} entries`
        : "Save entry";

  const pct = ((value - m.min) / (m.max - m.min)) * 100;
  const disp = value.toFixed(m.decimals);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }, sheetStyle]} onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}>
        <AuroraField blobs={[{ hue: m.rgb, size: 440, cx: true, top: 120, stops: [{ o: 0, a: 0.34 }, { o: 48, a: 0.14 }, { o: 74, a: 0 }] }]} />
        <View style={styles.grabber} />
        <Text style={styles.title}>Quick log</Text>

        <View style={styles.segRow}>
          {METRICS.map((d, i) => {
            const on = i === idx;
            const set = touched.has(d.key);
            return (
              <Pressable
                key={d.key}
                onPress={() => pickMetric(i)}
                style={[styles.seg, on && styles.segOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={set ? `${d.label}, set to ${values[d.key]} ${d.unit}` : d.label}
              >
                <Text style={[styles.segTxt, on && styles.segTxtOn]}>{d.label}</Text>
                {/* A dot in the metric's own hue: which ones are queued to save. */}
                {set ? <View style={[styles.segDot, { backgroundColor: d.hue }]} /> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.dialer}>
          <Stepper dir={-1} onPress={() => step(-1)} />
          <View style={styles.numWrap}>
            <Text style={[styles.num, { textShadowColor: `rgba(${m.rgb},0.4)` }]}>{disp}</Text>
            <Text style={styles.unit}>{m.unit}</Text>
          </View>
          <Stepper dir={1} onPress={() => step(1)} />
        </View>

        <GestureDetector gesture={rulerPan}>
          <View style={styles.ruler} onLayout={(e) => setRulerW(e.nativeEvent.layout.width)}>
            <View style={styles.tickRow} pointerEvents="none">
              {Array.from({ length: 25 }).map((_, i) => (
                <View key={i} style={[styles.tick, i % 5 === 0 && styles.tickTall]} />
              ))}
            </View>
            <View style={[styles.thumb, { left: `${pct}%`, backgroundColor: m.hue, shadowColor: m.hue }]} />
          </View>
        </GestureDetector>

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        <Pressable
          style={[styles.save, pending.length === 0 && styles.saveOff]}
          onPress={onSave}
          disabled={pending.length === 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending.length === 0 }}
          accessibilityLabel={
            pending.length === 0 ? "Save entry, nothing dialled yet" : saveLabel
          }
        >
          <Text style={styles.saveTxt}>{saveLabel}</Text>
        </Pressable>

        <Text style={styles.hint}>
          {pending.length === 0
            ? "Dial a value to log it."
            : "Set as many as you like, then save them together."}
        </Text>

        {status === "success" ? <SuccessOverlay count={pending.length} /> : null}
      </Animated.View>
    </View>
  );
}

function Stepper({ dir, onPress }: { dir: number; onPress: () => void }) {
  return (
    <Pressable style={styles.stepper} onPress={onPress} accessibilityRole="button" accessibilityLabel={dir < 0 ? "Decrease" : "Increase"}>
      <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
        <Path d="M2 8 H14" stroke={bio.alpha(0.85)} strokeWidth={2.4} strokeLinecap="round" />
        {dir > 0 ? <Path d="M8 2 V14" stroke={bio.alpha(0.85)} strokeWidth={2.4} strokeLinecap="round" /> : null}
      </Svg>
    </Pressable>
  );
}

function SuccessOverlay({ count }: { count: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: motion.duration.successOverlay, easing: motion.easeOut });
  }, [p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.7 + 0.3 * p.value }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.success, style]}>
      <SuccessCheck diameter={88} />
      <Text style={styles.successTitle}>{count > 1 ? `Saved ${count}` : "Saved"}</Text>
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
    backgroundColor: bio.color.ink,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: bio.color.border,
    paddingTop: 10,
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: bio.color.border, alignSelf: "center" },
  title: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: bio.color.text, marginTop: 18 },
  segRow: { flexDirection: "row", gap: 8, marginTop: 20 },
  seg: { flex: 1, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: bio.color.border2, alignItems: "center", justifyContent: "center" },
  segDot: { position: "absolute", top: 5, right: 5, width: 5, height: 5, borderRadius: 5 },
  segOn: { backgroundColor: "rgba(255,255,255,0.14)", borderColor: bio.color.border },
  segTxt: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: bio.alpha(0.5) },
  segTxtOn: { color: bio.color.text },
  dialer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28, marginTop: 40 },
  stepper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  numWrap: { minWidth: 150, alignItems: "center" },
  num: { fontFamily: fontFamily.dot, fontSize: 72, letterSpacing: 4, color: bio.color.text, textShadowRadius: 30, textShadowOffset: { width: 0, height: 0 } },
  unit: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 2, color: bio.alpha(0.5), textTransform: "uppercase", marginTop: 8 },
  ruler: { height: 44, marginTop: 32, justifyContent: "center" },
  tickRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tick: { width: 1.5, height: 12, borderRadius: 1, backgroundColor: bio.alpha(0.2) },
  tickTall: { height: 22, backgroundColor: bio.alpha(0.32) },
  thumb: { position: "absolute", top: 6, width: 3, height: 32, borderRadius: 2, marginLeft: -1.5, shadowRadius: 10, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 } },
  error: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.coral, marginTop: 16 },
  save: { height: 56, borderRadius: 999, backgroundColor: bio.color.text, alignItems: "center", justifyContent: "center", marginTop: 28 },
  saveOff: { opacity: 0.35 },
  saveTxt: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.ink },
  hint: {
    fontFamily: fontFamily.light,
    fontSize: 11.5,
    color: bio.alpha(0.45),
    textAlign: "center",
    marginTop: 12,
  },
  success: { backgroundColor: bio.color.ink, alignItems: "center", justifyContent: "center", gap: 14 },
  successTitle: { fontFamily: fontFamily.bold, fontSize: 24, color: bio.color.text },
});
