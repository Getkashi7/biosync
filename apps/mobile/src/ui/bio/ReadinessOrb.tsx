/**
 * Readiness orb — the Home hero, per the BIOSYNC design: a slowly-rotating dotted
 * track, a glowing gradient-tone progress arc drawn to the score, and a big
 * count-up number with a soft glow, over "READINESS" / a status word.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { bio, fontFamily } from "../theme";

const SIZE = 236;
const R = 104;
const C = 2 * Math.PI * R;

type Props = {
  /** 0–100, or null before anything is logged */
  score: number | null;
  /** the status word, e.g. "PRIMED" */
  status: string;
  /** arc + glow colour */
  accent?: string;
  /** rgb triple for the number's glow */
  accentRgb?: string;
  label?: string;
};

export function ReadinessOrb({
  score,
  status,
  accent = bio.color.tealLt,
  accentRgb = bio.aurora.teal,
  label = "Readiness",
}: Props) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: bio.motion.spin, easing: Easing.linear }), -1, false);
  }, [rot]);
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  const [disp, setDisp] = useState(0);
  useEffect(() => {
    if (score == null) {
      setDisp(0);
      return;
    }
    let raf = 0;
    const start = Date.now();
    const dur = 1200;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      setDisp(Math.round((1 - Math.pow(1 - t, 3)) * score));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const frac = score == null ? 0 : Math.max(0, Math.min(1, score / 100));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[StyleSheet.absoluteFill, trackStyle]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={118}
            cy={118}
            r={R}
            fill="none"
            stroke={bio.alpha(0.18)}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={[(0.4 / 100) * C, (2.35 / 100) * C]}
          />
        </Svg>
      </Animated.View>

      {score != null ? (
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
          <Circle
            cx={118}
            cy={118}
            r={R}
            fill="none"
            stroke={accent}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={[frac * C, C]}
            transform="rotate(-90 118 118)"
          />
        </Svg>
      ) : null}

      <View style={styles.center}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.num, { textShadowColor: `rgba(${accentRgb},0.4)` }]}>{score == null ? "—" : disp}</Text>
        <Text style={[styles.status, { color: accent }]}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center" },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 2.2,
    color: bio.alpha(0.5),
    textTransform: "uppercase",
  },
  num: {
    fontFamily: fontFamily.extrabold,
    fontSize: 92,
    lineHeight: 96,
    letterSpacing: -3.7,
    color: bio.color.text,
    marginVertical: 2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 32,
  },
  status: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    letterSpacing: 0.8,
  },
});
