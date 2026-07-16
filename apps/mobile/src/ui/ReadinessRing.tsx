/**
 * Readiness ring — the dashboard's centerpiece, per the Pulse Dashboard design.
 * A 208×208 track circle with a brand-gradient arc that sweeps to the score
 * over 800ms while the centered number counts up on the same clock.
 *
 * `score: null` renders the empty/error shape from the design's state variants:
 * track only, a dim "—" in the middle, no arc, no status label.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { color, gradient, motion, size, space, type } from "./theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const BOX = size.readinessRing;
const CENTER = BOX / 2;
const CIRCUMFERENCE = 2 * Math.PI * size.ringRadius; // ≈553, the design's dasharray

type Props = {
  /** 0–100, or null when there's nothing to score (empty/error states) */
  score: number | null;
};

export function ReadinessRing({ score }: Props) {
  // 0 → score/100; the arc and the count-up both derive from this one clock.
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.value = withTiming((score ?? 0) / 100, {
      duration: motion.duration.ringFill,
      easing: motion.easeOut,
    });
  }, [progress, score]);

  useAnimatedReaction(
    () => Math.round(progress.value * 100),
    (value, previous) => {
      if (value !== previous) runOnJS(setDisplay)(value);
    },
  );

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  return (
    <View style={styles.box}>
      <Svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} style={styles.svg}>
        <Defs>
          <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradient.brandColors[0]} />
            <Stop offset="0.45" stopColor={gradient.brandColors[1]} />
            <Stop offset="1" stopColor={gradient.brandColors[2]} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={size.ringRadius}
          fill="none"
          stroke={color.track}
          strokeWidth={size.ringStroke}
        />
        {score !== null ? (
          <AnimatedCircle
            cx={CENTER}
            cy={CENTER}
            r={size.ringRadius}
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth={size.ringStroke}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={arcProps}
          />
        ) : null}
      </Svg>
      <View style={styles.center}>
        {score !== null ? (
          <>
            <Text style={styles.score}>{display}</Text>
            <Text style={styles.status}>{score >= 60 ? "Ready to train" : "Rest today"}</Text>
          </>
        ) : (
          <Text style={styles.empty}>—</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: BOX,
    height: BOX,
  },
  svg: {
    // arc starts at 12 o'clock, as in the design
    transform: [{ rotate: "-90deg" }],
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  score: {
    ...type.score,
    color: color.text,
  },
  status: {
    ...type.caption,
    color: color.textStatus,
    marginTop: space.xxs,
  },
  empty: {
    ...type.score,
    color: color.textPlaceholder,
  },
});
