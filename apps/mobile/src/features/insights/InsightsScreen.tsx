/**
 * Insights — the Chat tab, built to the "Pulse Insights" design: a read-only
 * feed of plain-language observation cards grouped under TODAY / THIS WEEK, plus
 * a disabled phase-2 chat teaser. Cards, wording and thresholds are generated
 * server-side (insights.list); this screen is presentation-only.
 *
 *  - Populated: header (title + date + 🔥 streak pill), the sectioned card feed,
 *    then the teaser. Each element rises in with a 100ms stagger.
 *  - Loading: header + centered gradient spinner.
 *  - Empty (cold start): centered sparkle, a nudge line, a gradient "Log today".
 *  - Error: centered sparkle, message, ghost "Try again".
 *  - Refetches whenever `refreshKey` changes (MainTabs bumps it after a logging
 *    sheet closes); stale cards stay on screen during a refresh.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { LineChart } from "react-native-gifted-charts";
import { RiseIn } from "../../ui/RiseIn";
import { Spinner } from "../../ui/Spinner";
import { GradientButton } from "../../ui/GradientButton";
import { prettyToday } from "../../lib/date";
import { pressHaptic } from "../../lib/haptics";
import { color, gradient, motion, radius, size, space, type } from "../../ui/theme";
import { fetchInsights, type Insight, type InsightDelta, type InsightsResponse } from "./insightsApi";

type Props = {
  /** open the Log chooser (empty-state + nudge CTAs) */
  onLog: () => void;
  /** bump to refetch (after a logging sheet closes) */
  refreshKey: number;
};

/** Badge tint + dot colour per accent (gradient uses a gradient dot). */
const ACCENT: Record<Insight["accent"], { badge: string; dot: string }> = {
  blue: { badge: color.insightBadgeSleep, dot: color.blue },
  orange: { badge: color.insightBadgeWarm, dot: color.orange },
  coral: { badge: color.insightBadgeCoral, dot: color.coral },
  gradient: { badge: color.insightBadgeNeutral, dot: "" },
  muted: { badge: color.insightBadgeMuted, dot: color.insightNudgeDot },
};

/** Delta-pill palette: readiness reads cool, resting HR reads warm. */
const DELTA_STYLE: Partial<Record<Insight["accent"], { bg: string; fg: string }>> = {
  gradient: { bg: color.insightDeltaCoolBg, fg: color.blue2 },
  orange: { bg: color.insightDeltaWarmBg, fg: color.orange },
};

export function InsightsScreen({ onLog, refreshKey }: Props) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await fetchInsights());
    } catch {
      // No health values in logs (CLAUDE.md) — the error/stale states say enough.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const streak = data?.streak ?? 0;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.grow}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={color.text} />
      }
    >
      <RiseIn index={0}>
        <Header streak={streak} />
      </RiseIn>

      {data !== null && failed ? (
        <Text style={styles.staleNote}>Couldn’t refresh — showing your last insights</Text>
      ) : null}

      {data === null && !failed ? (
        <View style={styles.centerFill}>
          <Spinner tint={color.text} />
        </View>
      ) : data === null && failed ? (
        <ErrorState onRetry={() => void load()} />
      ) : data && data.insights.length === 0 ? (
        <EmptyState onLog={onLog} />
      ) : data ? (
        <Feed insights={data.insights} onLog={onLog} />
      ) : null}
    </ScrollView>
  );
}

function Header({ streak }: { streak: number }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.title}>Insights</Text>
        <Text style={styles.date}>{prettyToday()}</Text>
      </View>
      {streak > 0 ? (
        <View style={styles.streakPill}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={styles.streakCount}>{streak}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Flat feed item so each card/label rises in with its own stagger index. */
type FeedRow =
  | { kind: "label"; key: string; text: string; first: boolean }
  | { kind: "card"; key: string; insight: Insight }
  | { kind: "teaser"; key: string };

function Feed({ insights, onLog }: { insights: Insight[]; onLog: () => void }) {
  const today = insights.filter((i) => i.section === "today");
  const week = insights.filter((i) => i.section === "week");

  const rows: FeedRow[] = [];
  if (today.length > 0) {
    rows.push({ kind: "label", key: "l-today", text: "TODAY", first: true });
    today.forEach((i) => rows.push({ kind: "card", key: i.id, insight: i }));
  }
  if (week.length > 0) {
    rows.push({ kind: "label", key: "l-week", text: "THIS WEEK", first: false });
    week.forEach((i) => rows.push({ kind: "card", key: i.id, insight: i }));
  }
  rows.push({ kind: "teaser", key: "teaser" });

  return (
    <>
      {rows.map((row, i) => (
        <RiseIn key={row.key} index={i + 1}>
          {row.kind === "label" ? (
            <Text style={[styles.sectionLabel, row.first ? styles.sectionFirst : styles.sectionNext]}>{row.text}</Text>
          ) : row.kind === "card" ? (
            <View style={styles.cardWrap}>
              <InsightCard insight={row.insight} onLog={onLog} />
            </View>
          ) : (
            <View style={styles.teaserWrap}>
              <Teaser />
            </View>
          )}
        </RiseIn>
      ))}
    </>
  );
}

function InsightCard({ insight, onLog }: { insight: Insight; onLog: () => void }) {
  const muted = insight.accent === "muted";
  const accent = ACCENT[insight.accent] ?? ACCENT.blue;
  return (
    <View style={[styles.card, muted ? styles.cardMuted : null]}>
      <View style={styles.cardRow}>
        <Badge accent={insight.accent} dot={accent.dot} badge={accent.badge} emoji={insight.emoji} />
        <View style={styles.textCol}>
          <Text style={[styles.headline, muted ? styles.headlineMuted : null]}>{insight.headline}</Text>
          <Text style={[styles.sub, muted ? styles.subMuted : null]}>{insight.subline}</Text>
        </View>
        {insight.delta ? <DeltaChip delta={insight.delta} accent={insight.accent} /> : null}
        {muted ? <NudgeButton onPress={onLog} /> : null}
      </View>
      {insight.sparkline && insight.sparkline.length >= 2 ? <Sparkline values={insight.sparkline} /> : null}
    </View>
  );
}

function Badge({
  accent,
  dot,
  badge,
  emoji,
}: {
  accent: Insight["accent"];
  dot: string;
  badge: string;
  emoji?: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: badge }]}>
      {emoji ? (
        <Text style={styles.badgeEmoji}>{emoji}</Text>
      ) : accent === "gradient" ? (
        <LinearGradient
          colors={gradient.brandColors}
          locations={gradient.brandLocations}
          start={gradient.logoStart}
          end={gradient.logoEnd}
          style={styles.dot}
        />
      ) : (
        <View style={[styles.dot, { backgroundColor: dot }]} />
      )}
    </View>
  );
}

function DeltaChip({ delta, accent }: { delta: InsightDelta; accent: Insight["accent"] }) {
  const palette = DELTA_STYLE[accent] ?? { bg: color.insightDeltaCoolBg, fg: color.blue2 };
  return (
    <View style={[styles.deltaChip, { backgroundColor: palette.bg }]}>
      <DeltaArrow direction={delta.direction} color={palette.fg} />
      <Text style={[styles.deltaText, { color: palette.fg }]}>{delta.label}</Text>
    </View>
  );
}

/** 10×10 direction arrows traced from the design. */
function DeltaArrow({ direction, color: stroke }: { direction: InsightDelta["direction"]; color: string }) {
  const d =
    direction === "up"
      ? "M2 8 L8 2 M3.5 2 H8 V6.5"
      : direction === "down"
        ? "M2 2 L8 8 M3.5 8 H8 V3.5"
        : "M1.5 5 H8.5 M6 2.5 L8.5 5 L6 7.5";
  return (
    <Svg width={size.insightDeltaArrow} height={size.insightDeltaArrow} viewBox="0 0 10 10" fill="none">
      <Path d={d} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function NudgeButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(motion.pressScale, { duration: motion.duration.press, easing: motion.easeOut });
          pressHaptic();
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.pressSpring);
        }}
        hitSlop={space.sm}
        accessibilityRole="button"
        accessibilityLabel="Log it"
      >
        <View style={styles.nudgePill}>
          <Text style={styles.nudgePillText}>Log it</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** 130×44 sleep sparkline — cool gradient, matching the trend cards. */
function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  return (
    <View style={styles.sparkBox}>
      <LineChart
        data={values.map((value) => ({ value }))}
        width={size.statChartW}
        height={size.statChartH}
        adjustToWidth
        initialSpacing={0}
        endSpacing={0}
        disableScroll
        thickness={size.statStroke}
        hideDataPoints
        hideAxesAndRules
        hideRules
        hideYAxisText
        xAxisThickness={0}
        yAxisThickness={0}
        yAxisLabelWidth={0}
        yAxisOffset={min - span * 0.2}
        maxValue={span * 1.4}
        lineGradient
        lineGradientDirection="horizontal"
        lineGradientStartColor={gradient.chartCool[0]}
        lineGradientEndColor={gradient.chartCool[1]}
        isAnimated
        animationDuration={motion.duration.chartDraw}
      />
    </View>
  );
}

function Teaser() {
  return (
    <View style={styles.teaser}>
      <Sparkle sizePx={size.teaserIcon} stroke={color.teaserIcon} strokeWidth={2} />
      <Text style={styles.teaserText}>Ask Pulse about your data</Text>
      <View style={styles.teaserBadge}>
        <Text style={styles.teaserBadgeText}>SOON</Text>
      </View>
    </View>
  );
}

function EmptyState({ onLog }: { onLog: () => void }) {
  return (
    <RiseIn index={1} style={styles.centerFill}>
      <Sparkle sizePx={size.insightGlyph} stroke={color.insightGlyph} strokeWidth={1.8} />
      <Text style={styles.emptyCaption}>Log a few days of check-ins and your first insights will appear here</Text>
      <View style={styles.emptyCta}>
        <GradientButton label="Log today" onPress={onLog} />
      </View>
    </RiseIn>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <RiseIn index={1} style={styles.centerFill}>
      <Sparkle sizePx={size.insightGlyph} stroke={color.insightGlyph} strokeWidth={1.8} />
      <Text style={styles.emptyCaption}>Couldn’t load your insights</Text>
      <View style={styles.emptyCta}>
        <GradientButton label="Try again" variant="ghost" onPress={onRetry} />
      </View>
    </RiseIn>
  );
}

/** Four-point sparkle glyph — the Insights motif (teaser + empty/error). */
function Sparkle({ sizePx, stroke, strokeWidth }: { sizePx: number; stroke: string; strokeWidth: number }) {
  return (
    <Svg width={sizePx} height={sizePx} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3 C12.6 8.4 15.1 10.4 20.5 11 C15.1 11.6 12.6 13.6 12 19 C11.4 13.6 8.9 11.6 3.5 11 C8.9 10.4 11.4 8.4 12 3 Z"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
    paddingBottom: space.lg,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...type.greeting,
    color: color.text,
  },
  date: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: space.xxs,
  },
  streakPill: {
    height: size.streakPill,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    flexDirection: "row",
    alignItems: "center",
    gap: size.chipGap,
  },
  streakEmoji: {
    ...type.chipValue,
  },
  streakCount: {
    ...type.chipValue,
    color: color.text,
  },
  sectionLabel: {
    ...type.sectionLabel,
    color: color.textFaint,
  },
  sectionFirst: {
    marginTop: size.insightHeaderGap,
  },
  sectionNext: {
    marginTop: size.daySectionGap,
  },
  cardWrap: {
    marginTop: size.entryGap,
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingVertical: size.cardPadY,
    paddingHorizontal: space.base,
  },
  cardMuted: {
    backgroundColor: color.inset,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: size.insightBadgeGap,
  },
  badge: {
    width: size.insightBadge,
    height: size.insightBadge,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -space.xxs,
  },
  badgeEmoji: {
    fontSize: size.insightBadgeEmoji,
  },
  dot: {
    width: size.insightBadgeDot,
    height: size.insightBadgeDot,
    borderRadius: size.insightBadgeDot / 2,
  },
  textCol: {
    flex: 1,
  },
  headline: {
    ...type.insightHeadline,
    color: color.text,
  },
  headlineMuted: {
    color: color.textSecondary,
  },
  sub: {
    ...type.insightSub,
    color: color.textStat,
    marginTop: size.insightSubGap,
  },
  subMuted: {
    color: color.textTertiary,
  },
  deltaChip: {
    height: size.insightDeltaChip,
    paddingHorizontal: size.insightDeltaPadX,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: size.insightDeltaGap,
  },
  deltaText: {
    ...type.insightDelta,
  },
  nudgePill: {
    height: size.insightNudgePill,
    paddingHorizontal: size.insightNudgePillPadX,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  nudgePillText: {
    ...type.insightDelta,
    color: color.text,
  },
  sparkBox: {
    height: size.statChartH,
    marginTop: size.insightSparkGap,
    marginLeft: size.insightSparkIndent,
    overflow: "hidden",
  },
  teaserWrap: {
    marginTop: size.daySectionGap,
  },
  teaser: {
    backgroundColor: color.inset,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingVertical: size.cardPadY,
    paddingHorizontal: space.base,
    flexDirection: "row",
    alignItems: "center",
    gap: size.insightBadgeGap,
  },
  teaserText: {
    ...type.teaser,
    color: color.teaserText,
    flex: 1,
  },
  teaserBadge: {
    height: size.teaserBadge,
    paddingHorizontal: size.teaserBadgePadX,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.teaserBadgeBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  teaserBadgeText: {
    ...type.teaserBadge,
    color: color.teaserBadgeText,
  },
  emptyCaption: {
    ...type.hint,
    color: color.textTertiary,
    textAlign: "center",
    maxWidth: size.hintMaxW,
    marginTop: space.base,
  },
  emptyCta: {
    alignSelf: "stretch",
    marginTop: space.base,
  },
  staleNote: {
    ...type.captionSm,
    color: color.textTertiary,
    textAlign: "center",
    marginTop: space.md,
  },
});
