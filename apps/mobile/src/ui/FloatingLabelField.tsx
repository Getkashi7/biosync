/**
 * Floating-label text field.
 *
 *  - Label lifts on focus/value: translateY -26 + scale 0.78, origin left, 180ms.
 *  - Gradient focus underline: scaleX 0→1 (origin left), 200ms — hidden while error.
 *  - Bottom border color animates rest → focus → error (200ms, interpolateColor).
 *  - Password variant: Show/Hide toggle (selection haptic), 44dp touch target.
 */
import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { color, gradient, motion, size, type } from "./theme";
import { selectionHaptic } from "../lib/haptics";

const AnimatedText = Animated.createAnimatedComponent(Text);

type Props = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: boolean;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: () => void;
};

export function FloatingLabelField({
  label,
  value,
  onChangeText,
  error = false,
  secure = false,
  keyboardType,
  autoCapitalize = "none",
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);

  const lifted = focused || value.length > 0;

  // mode: 0 rest · 1 focus · 2 error  (drives border + label color)
  const mode = useSharedValue(0);
  const liftT = useSharedValue(lifted ? 1 : 0);
  const underline = useSharedValue(0);

  useEffect(() => {
    const target = error ? 2 : focused ? 1 : 0;
    mode.value = withTiming(target, { duration: motion.duration.errorBorder, easing: motion.easeOut });
    underline.value = withTiming(focused && !error ? 1 : 0, {
      duration: motion.duration.underline,
      easing: motion.easeEmphasized,
    });
  }, [error, focused, mode, underline]);

  useEffect(() => {
    liftT.value = withTiming(lifted ? 1 : 0, { duration: motion.duration.label, easing: motion.easeEmphasized });
  }, [lifted, liftT]);

  const borderStyle = useAnimatedStyle(() => ({
    borderBottomColor: interpolateColor(
      mode.value,
      [0, 1, 2],
      [color.fieldBorder, color.fieldBorderFocus, color.errorBorder],
    ),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(mode.value, [0, 1, 2], [color.textLabel, color.link, color.error]),
    transform: [
      { translateY: motion.labelLift.translateY * liftT.value },
      { scale: 1 + (motion.labelLift.scale - 1) * liftT.value },
    ],
  }));

  const underlineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: underline.value }] }));

  return (
    <Animated.View style={[styles.container, borderStyle]}>
      <AnimatedText style={[styles.label, labelStyle]}>{label}</AnimatedText>

      <TextInput
        style={[styles.input, secure && styles.inputWithToggle]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        secureTextEntry={hidden}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        selectionColor={color.caret}
        cursorColor={color.caret}
        placeholderTextColor={color.textLabel}
      />

      {secure ? (
        <Pressable
          style={styles.toggle}
          hitSlop={12}
          onPress={() => {
            selectionHaptic();
            setHidden((h) => !h);
          }}
          accessibilityRole="button"
          accessibilityLabel={hidden ? "Show password" : "Hide password"}
        >
          <Text style={styles.toggleText}>{hidden ? "Show" : "Hide"}</Text>
        </Pressable>
      ) : null}

      <Animated.View style={[styles.underline, underlineStyle]}>
        <LinearGradient
          colors={gradient.brandColors}
          locations={gradient.brandLocations}
          start={gradient.lineStart}
          end={gradient.lineEnd}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    paddingTop: 22,
    borderBottomWidth: 1,
    borderBottomColor: color.fieldBorder,
  },
  label: {
    position: "absolute",
    left: 0,
    bottom: 12,
    ...type.label,
    transformOrigin: "left center",
    pointerEvents: "none",
  },
  input: {
    ...type.input,
    color: color.text,
    paddingVertical: 0,
    paddingBottom: 12,
    paddingRight: 0,
  },
  inputWithToggle: {
    paddingRight: 64,
  },
  toggle: {
    position: "absolute",
    right: 0,
    bottom: 6,
    minWidth: size.touchTarget,
    minHeight: size.touchTarget,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  toggleText: {
    ...type.caption,
    color: color.textSecondary,
  },
  underline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: size.underline,
    transformOrigin: "left center",
  },
});
