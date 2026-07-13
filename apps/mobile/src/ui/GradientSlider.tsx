/**
 * Gesture-driven value slider — thumb + gradient fill track the finger directly
 * on the UI thread (no timing), snapping to `step`. Emits a value + selection
 * haptic only when the snapped step actually changes.
 *
 * Used by the check-in for Sleep hours (0–12, 0.5h steps). The big gradient
 * readout ("7.5h") sits above the track.
 */
import { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { GradientText } from "./GradientText";
import { selectionHaptic } from "../lib/haptics";
import { color, gradient, radius, size, space, type } from "./theme";

type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** unit suffix on the readout, e.g. "h" */
  unit?: string;
};

export function GradientSlider({ value, onChange, min = 0, max = 12, step = 0.5, unit = "h" }: Props) {
  const range = max - min;
  const trackW = useSharedValue(0);
  const progress = useSharedValue((value - min) / range);
  // Last snapped value, on the UI thread — dedupes step reports without
  // recreating the gesture when `value` changes (which would drop the drag).
  const lastVal = useSharedValue(value);

  // Keep the thumb + dedupe baseline in sync if `value` changes from outside.
  useAnimatedReaction(
    () => value,
    (v) => {
      progress.value = (v - min) / range;
      lastVal.value = v;
    },
  );

  // `onChange` (a useState setter) is stable, so this callback is stable too.
  const report = useCallback(
    (v: number) => {
      onChange(v);
      selectionHaptic();
    },
    [onChange],
  );

  // Built once per config; stable across value changes so an active drag is
  // never interrupted. Thumb/fill track the finger directly (no timing);
  // snap to a step and report only when the snapped value actually changes.
  const pan = useMemo(() => {
    const applyX = (x: number) => {
      "worklet";
      const w = trackW.value;
      if (w <= 0) return;
      const clamped = Math.min(Math.max(x, 0), w);
      const raw = (clamped / w) * range + min;
      const snapped = Math.min(Math.max(Math.round(raw / step) * step, min), max);
      progress.value = (snapped - min) / range;
      if (snapped !== lastVal.value) {
        lastVal.value = snapped;
        runOnJS(report)(snapped);
      }
    };
    return Gesture.Pan()
      .minDistance(0)
      .onBegin((e) => applyX(e.x))
      .onUpdate((e) => applyX(e.x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, step, range, report]);

  const fillStyle = useAnimatedStyle(() => ({ width: progress.value * trackW.value }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * trackW.value - size.sliderThumb / 2 }],
  }));

  return (
    <View>
      <GradientText style={type.readout}>{`${value.toFixed(1)}${unit}`}</GradientText>

      <GestureDetector gesture={pan}>
        <View style={styles.row} hitSlop={{ top: 8, bottom: 8 }}>
          <View
            style={styles.track}
            onLayout={(e) => {
              trackW.value = e.nativeEvent.layout.width;
            }}
          >
            <Animated.View style={[styles.fill, fillStyle]}>
              <LinearGradient
                colors={gradient.brandColors}
                locations={gradient.brandLocations}
                start={gradient.lineStart}
                end={gradient.lineEnd}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: size.sliderRow,
    justifyContent: "center",
    marginTop: space.sm,
  },
  track: {
    height: size.sliderTrack,
    borderRadius: radius.strength + 1,
    backgroundColor: color.dotTrack,
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    left: 0,
    height: size.sliderTrack,
    borderRadius: radius.strength + 1,
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    left: 0,
    width: size.sliderThumb,
    height: size.sliderThumb,
    borderRadius: size.sliderThumb / 2,
    backgroundColor: color.text,
  },
});
