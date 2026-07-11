/**
 * Indeterminate ring spinner used inside a loading CTA.
 * rotate 0→360° · 800ms · linear · infinite (UI thread).
 */
import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { color, motion } from "./theme";

export function Spinner({ sizePx = 20, trackColor = "rgba(255,255,255,0.35)", tint = color.onGradient }: {
  sizePx?: number;
  trackColor?: string;
  tint?: string;
}) {
  const rot = useSharedValue(0);

  useEffect(() => {
    rot.value = withRepeat(
      withTiming(360, { duration: motion.duration.spinner, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rot]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  return (
    <Animated.View
      style={[
        {
          width: sizePx,
          height: sizePx,
          borderRadius: sizePx / 2,
          borderWidth: 2.5,
          borderColor: trackColor,
          borderTopColor: tint,
        },
        style,
      ]}
    />
  );
}
