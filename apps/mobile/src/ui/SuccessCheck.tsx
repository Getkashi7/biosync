/**
 * Success checkmark badge for the check-in save state. On mount the badge pops
 * (scale 0.5 → 1, +80ms, 320ms) while the check path draws itself in. The ring
 * and check are stroked with the brand gradient via react-native-svg.
 *
 * The surrounding overlay (opacity + scale 0.6 → 1) is owned by the caller so
 * scrim, badge, and text can share one entrance clock.
 */
import { useEffect } from "react";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";
import { gradient, motion } from "./theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Check path length (M15 24.5 L21.5 31 L34 18) ≈ 27.2 — round up for a clean draw.
const CHECK_LEN = 28;

export function SuccessCheck({ diameter = 96 }: { diameter?: number }) {
  const pop = useSharedValue(0);

  useEffect(() => {
    pop.value = withDelay(
      motion.duration.successCheckDelay,
      withTiming(1, { duration: motion.duration.successCheck, easing: motion.easeEmphasized }),
    );
  }, [pop]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.5 + 0.5 * pop.value }],
    opacity: pop.value,
  }));

  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LEN * (1 - pop.value),
  }));

  return (
    <Animated.View style={badgeStyle}>
      <Svg width={diameter} height={diameter} viewBox="0 0 48 48">
        <Defs>
          <SvgLinearGradient id="checkGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradient.brandColors[0]} />
            <Stop offset="0.45" stopColor={gradient.brandColors[1]} />
            <Stop offset="1" stopColor={gradient.brandColors[2]} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="24" cy="24" r="21" fill="none" stroke="url(#checkGrad)" strokeWidth={3} />
        <AnimatedPath
          d="M15 24.5 L21.5 31 L34 18"
          fill="none"
          stroke="url(#checkGrad)"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={CHECK_LEN}
          animatedProps={checkProps}
        />
      </Svg>
    </Animated.View>
  );
}
