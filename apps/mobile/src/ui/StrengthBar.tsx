/**
 * Password strength meter: a gradient fill inside an overflow-hidden track,
 * animating the fill width 0 → 33/66/100% over 250ms. Reserves a fixed height
 * so the form doesn't jump when it appears.
 */
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { color, gradient, motion, radius, size, type } from "./theme";
import { STRENGTH_LABEL, STRENGTH_PCT, type StrengthScore } from "../features/auth/passwordStrength";

const PCT_NUM: Record<StrengthScore, number> = { 0: 0, 1: 33, 2: 66, 3: 100 };

export function StrengthBar({ score, visible }: { score: StrengthScore; visible: boolean }) {
  const width = useDerivedValue(() =>
    withTiming(visible ? PCT_NUM[score] : 0, {
      duration: motion.duration.strength,
      easing: motion.easeEmphasized,
    }),
  );

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={styles.slot}>
      {visible ? (
        <View style={styles.column}>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]}>
              <LinearGradient
                colors={gradient.brandColors}
                locations={gradient.brandLocations}
                start={gradient.lineStart}
                end={gradient.lineEnd}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          <Text style={styles.label}>{STRENGTH_LABEL[score]}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: 30,
    marginTop: 12,
  },
  column: {
    flexDirection: "column",
    gap: 7,
  },
  track: {
    height: size.strengthTrack,
    borderRadius: radius.strength,
    backgroundColor: color.hairline,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.strength,
    overflow: "hidden",
  },
  label: {
    ...type.captionSm,
    color: color.textTertiary,
  },
});

export { STRENGTH_PCT };
