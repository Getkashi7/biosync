/**
 * Entrance animation wrapper: opacity 0→1 + translateY 20→0, 420ms,
 * staggered by index × 100ms. Used for the Welcome and Success screens.
 */
import { useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { motion } from "./theme";

export function RiseIn({ index = 0, style, children }: { index?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(
      index * motion.duration.stagger,
      withTiming(1, { duration: motion.duration.rise, easing: motion.easeEmphasized }),
    );
  }, [index, p]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: motion.riseTranslateY * (1 - p.value) }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
