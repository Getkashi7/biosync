/**
 * Dotted progress ring — the BIOSYNC "device readout" gauge: a slowly-rotating
 * dotted track with an accent arc that draws itself in on mount, and whatever
 * you put in the middle.
 *
 * The arc is drawn by animating `strokeDashoffset` (a single number) rather than
 * the dash array, which keeps it on the UI thread via Reanimated. A wider,
 * low-opacity copy underneath stands in for the design's `drop-shadow` glow,
 * which RN's SVG can't do natively.
 *
 * Shared by the nutrition macro rings and the supplement adherence ring.
 */
import type { ReactNode } from "react";
import { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { bio, motion } from "../theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** arc draw-in, matching the design's `ringDraw` */
const DRAW_MS = 1600;

type Props = {
  size: number;
  /** circle radius inside the box */
  radius: number;
  /** 0–1+; clamped for the arc */
  progress: number;
  /** accent colour of the progress arc */
  color: string;
  children?: ReactNode;
  /** stagger the draw-in */
  delayMs?: number;
  /** one full rotation of the dotted track */
  spinMs?: number;
  trackWidth?: number;
  arcWidth?: number;
  /** dotted track dash, as a share of the path length (design uses ~0.45 / 2.9) */
  dotOn?: number;
  dotOff?: number;
  style?: StyleProp<ViewStyle>;
};

export function DottedRing({
  size,
  radius,
  progress,
  color,
  children,
  delayMs = 0,
  spinMs = 80_000,
  trackWidth = 1.8,
  arcWidth = 2.4,
  dotOn = 0.45,
  dotOff = 2.9,
  style,
}: Props) {
  const circumference = 2 * Math.PI * radius;
  const spin = useSharedValue(0);
  const draw = useSharedValue(0);

  useEffect(() => {
    // repeat without reversing: each pass restarts at 0, so it reads as one
    // continuous rotation and the value never accumulates.
    spin.value = withRepeat(withTiming(360, { duration: spinMs, easing: Easing.linear }), -1, false);
  }, [spin, spinMs]);

  useEffect(() => {
    const frac = Math.max(0, Math.min(1, progress));
    draw.value = 0;
    draw.value = withDelay(delayMs, withTiming(frac, { duration: DRAW_MS, easing: motion.easeEmphasized }));
  }, [draw, progress, delayMs]);

  const trackStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - draw.value) }));

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, trackStyle]}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={bio.alpha(0.16)}
            strokeWidth={trackWidth}
            strokeLinecap="round"
            strokeDasharray={[(dotOn / 100) * circumference, (dotOff / 100) * circumference]}
          />
        </Svg>
      </Animated.View>

      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={arcWidth + 3.6}
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          animatedProps={arcProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={arcWidth}
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          animatedProps={arcProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {children}
    </View>
  );
}
