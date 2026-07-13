/**
 * A row of 5 emoji option cells (sleep quality, mood). Selecting a cell scales
 * it to 1.06 and tints its fill/border orange over 150ms; a selection haptic
 * fires on tap. Value is the 0-based index, or null when unset.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { selectionHaptic } from "../lib/haptics";
import { color, motion, radius, size, space } from "./theme";

type Props = {
  emojis: readonly string[];
  value: number | null;
  onChange: (index: number) => void;
  /** accessibility label per option, same order as `emojis` */
  labels?: readonly string[];
};

function EmojiCell({
  emoji,
  selected,
  onPress,
  label,
}: {
  emoji: string;
  selected: boolean;
  onPress: () => void;
  label?: string;
}) {
  const sel = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    sel.value = withTiming(selected ? 1 : 0, { duration: motion.duration.select });
  }, [selected, sel]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (motion.selectScale - 1) * sel.value }],
    backgroundColor: interpolateColor(sel.value, [0, 1], [color.inset, color.emojiSelectedBg]),
    borderColor: interpolateColor(sel.value, [0, 1], [color.optBorder, color.emojiSelectedBorder]),
  }));

  return (
    <Pressable
      onPress={onPress}
      style={styles.cellPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.cell, animatedStyle]}>
        <Text style={styles.emoji} allowFontScaling={false}>
          {emoji}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function EmojiScale({ emojis, value, onChange, labels }: Props) {
  return (
    <View style={styles.row}>
      {emojis.map((emoji, i) => (
        <EmojiCell
          key={i}
          emoji={emoji}
          selected={value === i}
          label={labels?.[i]}
          onPress={() => {
            selectionHaptic();
            onChange(i);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.sm,
  },
  cellPress: {
    flex: 1,
  },
  cell: {
    height: size.emojiCell,
    borderRadius: radius.emoji,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 24,
    lineHeight: 30,
  },
});
