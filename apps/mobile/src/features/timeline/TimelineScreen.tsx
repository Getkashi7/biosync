/**
 * Journal timeline — the Calendar tab, built to the "Pulse Journal Timeline"
 * design: a reverse-chronological feed of day sections, each holding the day's
 * check-in card (with compact value chips) and slim metric rows (colored dot,
 * name, value, time). Empty variant: centered calendar icon, "No entries yet",
 * and a "Log today" CTA that opens the Log chooser.
 */
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { RiseIn } from "../../ui/RiseIn";
import { GradientButton } from "../../ui/GradientButton";
import { Spinner } from "../../ui/Spinner";
import { formatTime } from "../../lib/date";
import { ENERGY_WORDS, MOOD_WORDS } from "../../lib/ratings";
import { color, radius, size, space, type } from "../../ui/theme";
import { fetchTimeline, type CheckinEntry, type MetricEntry, type TimelineDay } from "./timelineApi";

/** Display name, unit, and dot color per metric type (journal rows). */
const METRIC_META: Record<string, { name: string; unit: string; dot: string }> = {
  RESTING_HR: { name: "Resting HR", unit: "bpm", dot: color.blue },
  HRV: { name: "HRV", unit: "ms", dot: color.orange },
  GLUCOSE: { name: "Glucose", unit: "mg/dL", dot: color.coral },
  WEIGHT: { name: "Weight", unit: "kg", dot: color.blue2 },
  SLEEP_HOURS: { name: "Sleep", unit: "h", dot: color.blue },
  SLEEP_QUALITY: { name: "Sleep quality", unit: "/5", dot: color.blue },
  HYDRATION: { name: "Hydration", unit: "ml", dot: color.blue2 },
  ENERGY: { name: "Energy", unit: "/5", dot: color.orange },
  MOOD: { name: "Mood", unit: "/5", dot: color.coral },
};

/** 72.4 → "72.4", 72 → "72" */
const formatValue = (v: number): string => String(Number(v.toFixed(1)));

type Row =
  | { kind: "label"; key: string; label: string }
  | { kind: "checkin"; key: string; entry: CheckinEntry }
  | { kind: "metric"; key: string; entry: MetricEntry };

function flatten(days: TimelineDay[]): Row[] {
  const rows: Row[] = [];
  for (const day of days) {
    rows.push({ kind: "label", key: `label-${day.date}`, label: day.label });
    if (day.checkin) rows.push({ kind: "checkin", key: `checkin-${day.date}`, entry: day.checkin });
    day.metrics.forEach((entry, i) => {
      rows.push({ kind: "metric", key: `metric-${day.date}-${i}`, entry });
    });
  }
  return rows;
}

type Props = {
  /** open the Log chooser (empty-state CTA) */
  onLog: () => void;
  /** bump to refetch (after a logging sheet closes) */
  refreshKey: number;
};

export function TimelineScreen({ onLog, refreshKey }: Props) {
  const [days, setDays] = useState<TimelineDay[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setDays(await fetchTimeline());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <View style={styles.flex}>
      <RiseIn index={0}>
        <Text style={styles.title}>Journal</Text>
        <Text style={styles.subtitle}>Your check-ins and metrics</Text>
      </RiseIn>

      {days === null && !failed ? (
        <View style={styles.centerFill}>
          <Spinner tint={color.text} />
        </View>
      ) : days === null && failed ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyCaption}>Couldn’t load your journal</Text>
          <View style={styles.retry}>
            <GradientButton label="Try again" variant="ghost" onPress={() => void load()} />
          </View>
        </View>
      ) : days && days.length === 0 ? (
        <EmptyJournal onLog={onLog} />
      ) : days ? (
        <RiseIn index={1} style={styles.flex}>
          <FlatList
            data={flatten(days)}
            keyExtractor={(row) => row.key}
            renderItem={({ item }) => <TimelineRow row={item} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.feed}
          />
        </RiseIn>
      ) : null}
    </View>
  );
}

function TimelineRow({ row }: { row: Row }) {
  if (row.kind === "label") {
    return <Text style={styles.dayLabel}>{row.label}</Text>;
  }
  if (row.kind === "checkin") {
    return <CheckinCard entry={row.entry} />;
  }
  return <MetricRow entry={row.entry} />;
}

function CheckinCard({ entry }: { entry: CheckinEntry }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <CheckinIcon />
        <Text style={styles.entryTitle}>Daily check-in</Text>
        <Text style={styles.time}>{formatTime(entry.createdAt)}</Text>
      </View>
      <View style={styles.chipRow}>
        <ValueChip label={`${formatValue(entry.sleepHours)}h sleep`} />
        <ValueChip label={`😴 ${entry.sleepQuality}/5`} />
        <ValueChip label={`⚡ ${ENERGY_WORDS[entry.energy - 1]}`} />
        <ValueChip label={`🙂 ${MOOD_WORDS[entry.mood - 1]}`} />
        {entry.weightKg !== null ? <ValueChip label={`${formatValue(entry.weightKg)} kg`} /> : null}
      </View>
    </View>
  );
}

function MetricRow({ entry }: { entry: MetricEntry }) {
  const meta = METRIC_META[entry.type] ?? { name: entry.type, unit: "", dot: color.blue2 };
  return (
    <View style={[styles.card, styles.metricCard]}>
      <View style={[styles.dot, { backgroundColor: meta.dot }]} />
      <Text style={styles.entryTitle}>{meta.name}</Text>
      <Text style={styles.metricValue}>
        {formatValue(entry.value)} {meta.unit}
      </Text>
      <Text style={styles.time}>{formatTime(entry.recordedAt)}</Text>
    </View>
  );
}

function ValueChip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function EmptyJournal({ onLog }: { onLog: () => void }) {
  return (
    <RiseIn index={1} style={styles.centerFill}>
      <CalendarIcon />
      <Text style={styles.emptyTitle}>No entries yet</Text>
      <Text style={styles.emptyCaption}>Your check-ins and logged metrics will appear here</Text>
      <View style={styles.emptyCta}>
        <GradientButton label="Log today" onPress={onLog} />
      </View>
    </RiseIn>
  );
}

/** Clipboard with a tick, at journal size (LogChooser draws the 24px variant). */
function CheckinIcon() {
  return (
    <Svg width={size.journalIcon} height={size.journalIcon} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={4} width={14} height={17} rx={3} stroke={color.iconStrong} strokeWidth={2} />
      <Path d="M9 2.5 H15 V6 H9 Z" stroke={color.iconStrong} strokeWidth={2} strokeLinejoin="round" />
      <Path
        d="M9 13.5 L11.2 15.7 L15.5 11"
        stroke={color.iconStrong}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Calendar outline — the empty state's icon (same paths as the tab icon). */
function CalendarIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5} width={16} height={15} rx={3} stroke={color.iconInactive} strokeWidth={2} />
      <Path d="M4 10 H20 M8 3 V6 M16 3 V6" stroke={color.iconInactive} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...type.greeting,
    color: color.text,
  },
  subtitle: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: space.xxs,
  },
  feed: {
    // first label's marginTop + this = the design's 20 header→feed gap; card
    // marginBottom (10) + label marginTop (10) = the 20 between day sections
    paddingTop: size.entryGap,
    paddingBottom: space.lg,
  },
  dayLabel: {
    ...type.sectionLabel,
    color: color.textFaint,
    marginTop: size.entryGap,
    marginBottom: size.entryGap,
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingVertical: size.cardPadY,
    paddingHorizontal: space.base,
    marginBottom: size.entryGap,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: size.entryGap,
  },
  metricCard: {
    paddingVertical: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: size.entryGap,
  },
  entryTitle: {
    ...type.entryTitle,
    color: color.text,
    flexShrink: 1,
  },
  metricValue: {
    ...type.entryTitle,
    color: color.textStrong,
    flex: 1,
  },
  time: {
    ...type.captionSm,
    color: color.textTertiary,
    marginLeft: "auto",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: size.chipGap,
    marginTop: size.entryGap,
  },
  chip: {
    height: size.journalChip,
    paddingHorizontal: size.journalChipPadX,
    borderRadius: radius.pill,
    backgroundColor: color.inset,
    justifyContent: "center",
  },
  chipText: {
    ...type.journalChip,
    color: color.textStrong,
  },
  dot: {
    width: size.chipDot,
    height: size.chipDot,
    borderRadius: size.chipDot / 2,
  },
  emptyTitle: {
    ...type.greeting,
    color: color.text,
    marginTop: space.base,
  },
  emptyCaption: {
    ...type.body,
    color: color.textSecondary,
    textAlign: "center",
    maxWidth: size.hintMaxW,
    marginTop: space.sm,
  },
  emptyCta: {
    alignSelf: "stretch",
    marginTop: space.base,
  },
  retry: {
    alignSelf: "stretch",
    marginTop: space.md,
  },
});
