/**
 * Horizontal error-shake: translateX 0 → -8 → 7 → -4 → 2 → 0 over ~320ms
 * (5 linear steps). Returns an animated style and a trigger to fire it.
 */
import { useCallback } from "react";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { motion } from "./theme";

export function useShake() {
  const tx = useSharedValue(0);
  const stepDuration = Math.round(motion.duration.shake / motion.shakeSequence.length);

  const trigger = useCallback(() => {
    const steps = motion.shakeSequence.map((to) =>
      withTiming(to, { duration: stepDuration, easing: Easing.linear }),
    );
    // withSequence needs at least the first arg; spread the fixed 5-step array.
    tx.value = withSequence(
      steps[0]!,
      steps[1]!,
      steps[2]!,
      steps[3]!,
      steps[4]!,
    );
  }, [stepDuration, tx]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return { style, trigger };
}
