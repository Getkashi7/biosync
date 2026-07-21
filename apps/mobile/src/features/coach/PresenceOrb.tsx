/**
 * Presence orb — the Coach's "listening" mark on the first-run Ask screen: a
 * slowly-rotating dotted teal ring around a soft, breathing gradient core. Mirrors
 * the design's orb (116px ring, 52px core). Motion runs on the UI thread.
 */
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { bio } from "../../ui/theme";

const SIZE = 116;
const R = 50;
const C = 2 * Math.PI * R;
const CORE = 52;

export function PresenceOrb() {
  const rot = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 60000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [rot, pulse]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.85, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.94, 1.04]) }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={bio.color.tealLt}
            strokeOpacity={0.4}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={[(0.4 / 100) * C, (2.4 / 100) * C]}
          />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.core, coreStyle]}>
        <Svg width={CORE} height={CORE}>
          <Defs>
            <RadialGradient id="presenceCore" cx="35%" cy="30%" r="75%">
              <Stop offset="0%" stopColor={bio.color.tealLt} stopOpacity={0.95} />
              <Stop offset="100%" stopColor={bio.color.teal} stopOpacity={0.55} />
            </RadialGradient>
          </Defs>
          <Circle cx={CORE / 2} cy={CORE / 2} r={CORE / 2} fill="url(#presenceCore)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  core: {
    width: CORE,
    height: CORE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: bio.color.teal,
    shadowOpacity: 0.7,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 0 },
  },
});
