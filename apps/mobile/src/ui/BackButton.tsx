/**
 * Chevron back button — 44×44 touch target, tertiary color.
 */
import { Pressable, StyleSheet, Text } from "react-native";
import { color, size } from "./theme";

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.hit} hitSlop={8} onPress={onPress} accessibilityRole="button" accessibilityLabel="Go back">
      <Text style={styles.chevron}>‹</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: size.touchTarget,
    height: size.touchTarget,
    marginLeft: -14,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    color: color.textSecondary,
    fontSize: 30,
    lineHeight: 34,
  },
});
