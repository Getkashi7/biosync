/**
 * 5-dot energy rating. Dots up to and including the selection fill with the
 * brand gradient sampled by position (orange → blue, left → right); the selected
 * dot scales to 1.15. Fill/scale animate over 150ms; selection fires a haptic.
 * Value is the 0-based index, or null when unset.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { selectionHaptic } from "../lib/haptics";
import { color, gradient, motion, size, space, type } from "./theme";

const ENERGY_WORDS = ["Very low", "Low", "Okay", "High", "Very high"] as const;

// Sample the 3-stop brand gradient at t∈[0,1] so the row reads left→right.
function sampleBrand(t: number): string {
  const stops = gradient.brandColors.map(hexToRgb);
  const locs = gradient.brandLocations;
  for (let i = 1; i < locs.length; i++) {
    const a = locs[i - 1]!;
    const b = locs[i]!;
    if (t <= b) {
      const local = b === a ? 0 : (t - a) / (b - a);
      return mix(stops[i - 1]!, stops[i]!, local);
    }
  }
  return rgbToHex(stops[stops.length - 1]!);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  const to = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

const N = 5;
const DOT_COLORS = Array.from({ length: N }, (_, i) => sampleBrand(i / (N - 1)));

function Dot({ index, value, onPress }: { index: number; value: number | null; onPress: () => void }) {
  const filled = value !== null && index <= value;
  const isSelected = value === index;
  const fill = useSharedValue(filled ? 1 : 0);
  const scale = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(filled ? 1 : 0, { duration: motion.duration.select });
    scale.value = withTiming(isSelected ? 1 : 0, { duration: motion.duration.select });
  }, [filled, isSelected, fill, scale]);

  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (motion.dotSelectScale - 1) * scale.value }],
  }));

  return (
    // The dot carries all the meaning visually, so without a name it announces
    // as one of five identical buttons. "radio" is the honest semantic: one
    // choice out of a set, and the state says which one is taken.
    <Pressable
      onPress={onPress}
      style={styles.dotPress}
      accessibilityRole="radio"
      accessibilityLabel={ENERGY_WORDS[index]}
      accessibilityState={{ selected: isSelected }}
    >
      <Animated.View style={[styles.dot, dotStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dotFill, { backgroundColor: DOT_COLORS[index] }, fillStyle]} />
      </Animated.View>
    </Pressable>
  );
}

type Props = {
  value: number | null;
  onChange: (index: number) => void;
};

export function EnergyDots({ value, onChange }: Props) {
  return (
    <View>
      <Text style={styles.word}>{value === null ? "—" : ENERGY_WORDS[value]}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Energy">
        {Array.from({ length: N }, (_, i) => (
          <Dot
            key={i}
            index={i}
            value={value}
            onPress={() => {
              selectionHaptic();
              onChange(i);
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  word: {
    ...type.caption,
    color: color.textSecondary,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: "row",
    height: size.dotRow,
    alignItems: "center",
    gap: space.md,
  },
  dotPress: {
    height: size.dotRow,
    justifyContent: "center",
  },
  dot: {
    width: size.dot,
    height: size.dot,
    borderRadius: size.dot / 2,
    backgroundColor: color.dotTrack,
    overflow: "hidden",
  },
  dotFill: {
    borderRadius: size.dot / 2,
  },
});
