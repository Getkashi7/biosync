/**
 * Primary CTA (gradient fill) and ghost (1px border) button.
 *
 * Press-in: scale → 0.97 over 120ms + light haptic. Release: spring back.
 * loading: label fades to a ring spinner; press is disabled while loading.
 * 56dp tall, 16dp radius.
 */
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { color, gradient, motion, radius, size, type } from "./theme";
import { pressHaptic } from "../lib/haptics";
import { Spinner } from "./Spinner";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "gradient" | "ghost";
  loading?: boolean;
  disabled?: boolean;
};

export function GradientButton({ label, onPress, variant = "gradient", loading = false, disabled = false }: Props) {
  const scale = useSharedValue(1);
  const isGradient = variant === "gradient";
  const inactive = loading || disabled;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = () => {
    if (inactive) return;
    scale.value = withTiming(motion.pressScale, {
      duration: motion.duration.press,
      easing: motion.easeOut,
    });
    pressHaptic();
  };

  const onPressOut = () => {
    scale.value = withSpring(1, motion.pressSpring);
  };

  const inner = (
    <View style={styles.center}>
      {loading ? (
        <Spinner tint={isGradient ? color.onGradient : color.text} />
      ) : (
        <Text style={[styles.label, { color: isGradient ? color.onGradient : color.text }]}>{label}</Text>
      )}
    </View>
  );

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={inactive ? undefined : onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive, busy: loading }}
      >
        {isGradient ? (
          <LinearGradient
            colors={gradient.brandColors}
            locations={gradient.brandLocations}
            start={gradient.ctaStart}
            end={gradient.ctaEnd}
            style={styles.fill}
          >
            {inner}
          </LinearGradient>
        ) : (
          <View style={[styles.fill, styles.ghost]}>{inner}</View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    height: size.ctaHeight,
    borderRadius: radius.cta,
    alignItems: "center",
    justifyContent: "center",
  },
  ghost: {
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: "transparent",
  },
  center: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...type.button,
  },
});
