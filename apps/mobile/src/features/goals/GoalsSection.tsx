/**
 * "GOALS" dashboard section, per the Pulse Goals design (frame 1): goal cards
 * (description, linked-metric chip with its dot color, since-date) and a
 * dashed "+ New goal" row. The ghost row doubles as the empty state.
 */
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Pressable } from "react-native";
import { pressHaptic } from "../../lib/haptics";
import { prettyDate } from "../../lib/date";
import { METRIC_META, FALLBACK_META } from "../../lib/metricMeta";
import { color, motion, radius, size, space, type } from "../../ui/theme";
import type { Goal } from "./goalsApi";

export function GoalsSection({ goals, onNewGoal }: { goals: Goal[]; onNewGoal: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>GOALS</Text>
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
      <NewGoalRow onPress={onNewGoal} />
    </View>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const meta = goal.targetMetric ? (METRIC_META[goal.targetMetric] ?? FALLBACK_META) : null;
  return (
    <View style={styles.card}>
      <Text style={styles.description}>{goal.description}</Text>
      <View style={styles.metaRow}>
        {meta ? (
          <View style={styles.chip}>
            <View style={[styles.chipDot, { backgroundColor: meta.dot }]} />
            <Text style={styles.chipText}>{meta.name}</Text>
          </View>
        ) : null}
        <Text style={styles.since}>since {prettyDate(goal.createdAt)}</Text>
      </View>
    </View>
  );
}

function NewGoalRow({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={styles.newGoal}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(motion.pressScale, {
            duration: motion.duration.press,
            easing: motion.easeOut,
          });
          pressHaptic();
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.pressSpring);
        }}
        accessibilityRole="button"
        accessibilityLabel="New goal"
      >
        <Text style={styles.newGoalText}>+ New goal</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: size.daySectionGap,
    gap: size.entryGap,
  },
  label: {
    ...type.sectionLabel,
    color: color.textFaint,
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingVertical: size.cardPadY,
    paddingHorizontal: space.base,
  },
  description: {
    ...type.entryTitle,
    color: color.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.sm,
  },
  chip: {
    height: size.journalChip,
    paddingHorizontal: size.journalChipPadX,
    borderRadius: radius.pill,
    backgroundColor: color.inset,
    flexDirection: "row",
    alignItems: "center",
    gap: size.chipGap,
  },
  chipDot: {
    width: size.chipDot,
    height: size.chipDot,
    borderRadius: size.chipDot / 2,
  },
  chipText: {
    ...type.journalChip,
    color: color.textStrong,
  },
  since: {
    ...type.captionSm,
    color: color.textTertiary,
  },
  newGoal: {
    height: size.touchTarget,
    borderRadius: radius.emoji,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  newGoalText: {
    ...type.entryTitle,
    color: color.textSecondary,
  },
});
