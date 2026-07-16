/**
 * Home dashboard — readiness ring + today's numbers, built to the Pulse
 * Dashboard design and its state variants (empty / low confidence / error).
 *
 *  - Header: time-of-day greeting (+ first name when known), date line, and a
 *    🔥 streak pill that hides while the streak is 0.
 *  - Ready: ring sweeps to the score; chips show today's logged numbers; a
 *    low-confidence hint appears under the chips when the score rests on a
 *    single data source.
 *  - Empty (nothing logged): track-only ring with "—", a nudge caption, and a
 *    gradient CTA that opens Quick Log.
 *  - Error: track-only ring, caption, ghost "Try again".
 *  - Refetches whenever `refreshKey` changes (MainTabs bumps it after a logging
 *    sheet closes); stale data stays on screen during a refresh.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { RiseIn } from "../../ui/RiseIn";
import { ReadinessRing } from "../../ui/ReadinessRing";
import { GradientButton } from "../../ui/GradientButton";
import { Spinner } from "../../ui/Spinner";
import { prettyToday } from "../../lib/date";
import { color, radius, size, space, type } from "../../ui/theme";
import { useAuth } from "../auth/AuthProvider";
import { ENERGY_WORDS, MOOD_WORDS } from "../../lib/ratings";
import { fetchDashboard, type DashboardData, type ReadinessToday } from "./dashboardApi";
import { fetchTrends, type Trends } from "./trendsApi";
import { TrendCards, hasAnyTrendData } from "./TrendCards";
import { fetchGoals, type Goal } from "../goals/goalsApi";
import { GoalsSection } from "../goals/GoalsSection";

function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** 7.5 → "7.5", 8 → "8" */
function formatHours(hours: number): string {
  return String(Number(hours.toFixed(1)));
}

type Props = {
  /** open the Quick Log sheet (empty-state CTA) */
  onQuickLog: () => void;
  /** open the New-goal sheet ("+ New goal" row) */
  onNewGoal: () => void;
  /** bump to refetch (after a logging sheet closes) */
  refreshKey: number;
};

export function DashboardScreen({ onQuickLog, onNewGoal, refreshKey }: Props) {
  const { session } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [dashboard, trendData, goalData] = await Promise.all([
        fetchDashboard(),
        fetchTrends(),
        fetchGoals(),
      ]);
      setData(dashboard);
      setTrends(trendData);
      setGoals(goalData);
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

  const firstName = session?.fullName?.trim().split(/\s+/)[0];
  const streak = data?.streak ?? 0;
  const readiness = data?.readiness ?? null;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.flexGrow}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={color.text} />}
    >
      <RiseIn index={0}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </Text>
            <Text style={styles.date}>{prettyToday()}</Text>
          </View>
          {streak > 0 ? (
            <View style={styles.streakPill}>
              <Text style={styles.streakEmoji}>🔥</Text>
              <Text style={styles.streakCount}>{streak}</Text>
            </View>
          ) : null}
        </View>
      </RiseIn>

      {data !== null && failed ? (
        <Text style={styles.staleNote}>Couldn’t refresh — showing your last numbers</Text>
      ) : null}

      {data === null && !failed ? (
        <View style={styles.centerFill}>
          <Spinner tint={color.text} />
        </View>
      ) : data === null && failed ? (
        <ErrorState onRetry={() => void load()} />
      ) : readiness && readiness.score === null ? (
        <EmptyState onQuickLog={onQuickLog} />
      ) : readiness ? (
        <ReadyState readiness={readiness} />
      ) : null}

      {data !== null && trends && hasAnyTrendData(trends) ? (
        <RiseIn index={3}>
          <TrendCards trends={trends} />
        </RiseIn>
      ) : null}

      {data !== null && goals !== null ? (
        <RiseIn index={4}>
          <GoalsSection goals={goals} onNewGoal={onNewGoal} />
        </RiseIn>
      ) : null}
    </ScrollView>
  );
}

function ReadyState({ readiness }: { readiness: ReadinessToday }) {
  const { components } = readiness;
  return (
    <RiseIn index={1}>
      <View style={styles.ringBlock}>
        <ReadinessRing score={readiness.score} />
        <View style={styles.chips}>
          {components.sleep ? (
            <Chip dot={color.blue} label={`Sleep ${formatHours(components.sleep.hours)}h`} />
          ) : null}
          {components.energyMood ? (
            <>
              <Chip dot={color.orange} label={`Energy ${ENERGY_WORDS[components.energyMood.energy - 1]}`} />
              <Chip dot={color.coral} label={`Mood ${MOOD_WORDS[components.energyMood.mood - 1]}`} />
            </>
          ) : null}
          {components.restingHr ? (
            <Chip dot={color.blue2} label={`HR ${Math.round(components.restingHr.current)}`} />
          ) : null}
        </View>
        {readiness.lowConfidence ? (
          <RiseIn index={2}>
            <View style={styles.hintRow}>
              <View style={styles.hintDot}>
                <View style={styles.hintDotCore} />
              </View>
              <Text style={styles.hintText}>Low confidence — log more data for a better score</Text>
            </View>
          </RiseIn>
        ) : null}
      </View>
    </RiseIn>
  );
}

function EmptyState({ onQuickLog }: { onQuickLog: () => void }) {
  return (
    <>
      <RiseIn index={1}>
        <View style={styles.ringBlock}>
          <ReadinessRing score={null} />
          <Text style={styles.emptyCaption}>
            Log your sleep, energy and heart rate to unlock your readiness score
          </Text>
        </View>
      </RiseIn>
      <RiseIn index={2} style={styles.emptyCta}>
        <GradientButton label="Log your first metrics" onPress={onQuickLog} />
      </RiseIn>
    </>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <RiseIn index={1}>
        <View style={styles.ringBlock}>
          <ReadinessRing score={null} />
          <Text style={styles.emptyCaption}>Couldn’t load your readiness</Text>
        </View>
      </RiseIn>
      <RiseIn index={2} style={styles.errorCta}>
        <GradientButton label="Try again" variant="ghost" onPress={onRetry} />
      </RiseIn>
    </>
  );
}

function Chip({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.chipDot, { backgroundColor: dot }]} />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexGrow: {
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
  greeting: {
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
  ringBlock: {
    alignItems: "center",
    marginTop: size.dashSectionGap,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.sm,
    marginTop: size.chipRowGap,
  },
  chip: {
    height: size.chip,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
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
    ...type.captionSm,
    color: color.textStrong,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: size.hintGap,
  },
  hintDot: {
    width: size.hintDot,
    height: size.hintDot,
    borderRadius: size.hintDot / 2,
    backgroundColor: color.warnDotBg,
    alignItems: "center",
    justifyContent: "center",
  },
  hintDotCore: {
    width: size.hintDotCore,
    height: size.hintDotCore,
    borderRadius: size.hintDotCore / 2,
    backgroundColor: color.orange,
  },
  hintText: {
    ...type.captionSm,
    color: color.textTertiary,
  },
  emptyCaption: {
    ...type.hint,
    color: color.textTertiary,
    textAlign: "center",
    maxWidth: size.hintMaxW,
    marginTop: size.chipRowGap,
  },
  emptyCta: {
    marginTop: space.base,
  },
  errorCta: {
    marginTop: space.md,
  },
  staleNote: {
    ...type.captionSm,
    color: color.textTertiary,
    textAlign: "center",
    marginTop: space.md,
  },
});
