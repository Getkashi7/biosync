/**
 * 7-day trend cards, per the Pulse Dashboard design's stat cards: surface card,
 * small title, bold value + accent word, and a 130×44 gradient sparkline.
 * Under MIN_TREND_POINTS days of data a card keeps its shape and shows the
 * "log a few more days" copy instead of a line.
 */
import { StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { color, gradient, motion, radius, size, space, type } from "../../ui/theme";
import { MIN_TREND_POINTS, type Trends, type TrendSeries } from "./trendsApi";

/** "7.4 → 7h 24m" */
function formatSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 60) return `${h + 1}h 0m`;
  return `${h}h ${m}m`;
}

export function hasAnyTrendData(trends: Trends): boolean {
  return trends.sleep.values.length > 0 || trends.restingHr.values.length > 0 || trends.weight.values.length > 0;
}

export function TrendCards({ trends }: { trends: Trends }) {
  return (
    <View style={styles.grid}>
      <TrendCard
        title="Sleep · 7d"
        value={trends.sleep.stat !== null ? formatSleep(trends.sleep.stat) : null}
        accent="avg"
        accentColor={color.blue2}
        series={trends.sleep}
        stroke={gradient.chartCool}
      />
      <TrendCard
        title="Resting HR · 7d"
        value={trends.restingHr.stat !== null ? `${Math.round(trends.restingHr.stat)} bpm` : null}
        accent="avg"
        accentColor={color.orange}
        series={trends.restingHr}
        stroke={gradient.chartWarm}
      />
      <TrendCard
        title="Weight · 7d"
        value={trends.weight.stat !== null ? `${Number(trends.weight.stat.toFixed(1))} kg` : null}
        accent="latest"
        accentColor={color.blue2}
        series={trends.weight}
        stroke={gradient.chartCool}
      />
    </View>
  );
}

function TrendCard({
  title,
  value,
  accent,
  accentColor,
  series,
  stroke,
}: {
  title: string;
  value: string | null;
  accent: string;
  accentColor: string;
  series: TrendSeries;
  stroke: readonly [string, string];
}) {
  const chartable = series.values.length >= MIN_TREND_POINTS;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>
        {value ?? "—"}
        {value ? <Text style={[styles.accent, { color: accentColor }]}> {accent}</Text> : null}
      </Text>
      <View style={styles.chartBox}>
        {chartable ? (
          <Sparkline values={series.values} stroke={stroke} />
        ) : (
          <Text style={styles.sparse}>Log a few more days to see trends</Text>
        )}
      </View>
    </View>
  );
}

function Sparkline({ values, stroke }: { values: number[]; stroke: readonly [string, string] }) {
  // Scale the y-axis to the series' own range so near-flat series (weight)
  // still show shape; 20% padding below, 40% headroom overall.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  return (
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
      lineGradientStartColor={stroke[0]}
      lineGradientEndColor={stroke[1]}
      isAnimated
      animationDuration={motion.duration.chartDraw}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: space.md,
    marginTop: size.dashSectionGap,
  },
  card: {
    width: "48%",
    borderRadius: radius.card,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingVertical: size.cardPadY,
    paddingHorizontal: space.base,
  },
  title: {
    ...type.captionSm,
    color: color.textStat,
  },
  value: {
    ...type.statValue,
    color: color.text,
    marginTop: space.xxs,
  },
  accent: {
    ...type.captionSm,
  },
  chartBox: {
    height: size.statChartH,
    marginTop: space.sm,
    justifyContent: "center",
    overflow: "hidden",
  },
  sparse: {
    ...type.captionSm,
    color: color.textTertiary,
  },
});
