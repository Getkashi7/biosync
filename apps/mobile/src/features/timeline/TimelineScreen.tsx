/**
 * Trends & journal — BIOSYNC redesign (the "Trends" tab). Aurora field + a glass
 * 7-day sleep bar chart, then a journal timeline of recent check-ins + metrics on
 * a dotted spine. Full-bleed; clears the floating tab bar.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { GlassSurface } from "../../ui/bio/GlassSurface";
import { Spinner } from "../../ui/Spinner";
import { GradientButton } from "../../ui/GradientButton";
import { formatTime } from "../../lib/date";
import { todayLocal } from "../checkin/checkinApi";
import { ENERGY_WORDS, MOOD_WORDS } from "../../lib/ratings";
import { METRIC_META, FALLBACK_META } from "../../lib/metricMeta";
import { bio, fontFamily } from "../../ui/theme";
import { fetchTimeline, type TimelineDay } from "./timelineApi";

const WD = ["S", "M", "T", "W", "T", "F", "S"];
const fmt = (v: number): string => String(Number(v.toFixed(1)));

const METRIC_HUE: Record<string, string> = {
  RESTING_HR: bio.color.coral,
  HRV: bio.color.blue,
  WEIGHT: bio.color.tealLt2,
  GLUCOSE: bio.color.amber,
  SLEEP_HOURS: bio.color.violet,
};
const hueFor = (t: string): string => METRIC_HUE[t] ?? bio.color.blue;

type Bar = { label: string; value: number | null };
function last7Sleep(days: TimelineDay[]): Bar[] {
  const byDate = new Map(days.map((d) => [d.date, d.checkin?.sleepHours ?? null]));
  const now = new Date();
  const out: Bar[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - i);
    out.push({ label: WD[dt.getDay()]!, value: byDate.get(todayLocal(dt)) ?? null });
  }
  return out;
}

type JEntry = { key: string; dot: string; text: string; time: string; tags: string[] };
function journal(days: TimelineDay[]): JEntry[] {
  const out: JEntry[] = [];
  for (const day of days.slice(0, 4)) {
    if (day.checkin) {
      const c = day.checkin;
      out.push({
        key: `c-${day.date}`,
        dot: bio.color.violet,
        text: "Daily check-in",
        time: formatTime(c.createdAt),
        tags: [`${fmt(c.sleepHours)}h`, ENERGY_WORDS[c.energy - 1] ?? "", MOOD_WORDS[c.mood - 1] ?? ""].filter(Boolean),
      });
    }
    day.metrics.forEach((m, i) => {
      const meta = METRIC_META[m.type] ?? FALLBACK_META;
      out.push({
        key: `m-${day.date}-${i}`,
        dot: hueFor(m.type),
        text: `${meta.name} · ${fmt(m.value)} ${meta.unit}`.trim(),
        time: formatTime(m.recordedAt),
        tags: [],
      });
    });
  }
  return out.slice(0, 8);
}

export function TimelineScreen({ onLog, refreshKey }: { onLog: () => void; refreshKey: number }) {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<TimelineDay[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const bars = days ? last7Sleep(days) : [];
  const present = bars.filter((b) => b.value !== null).map((b) => b.value as number);
  const max = present.length ? Math.max(...present, 8) : 8;
  const avg = present.length ? present.reduce((s, v) => s + v, 0) / present.length : null;
  const entries = days ? journal(days) : [];

  return (
    <View style={styles.root}>
      <AuroraField blobs={[{ hue: bio.aurora.teal, size: 400, right: -140, top: -120, stops: [{ o: 0, a: 0.24 }, { o: 70, a: 0 }] }]} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: 130 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />}
      >
        <Text style={styles.title}>Trends</Text>

        {days === null ? (
          <View style={styles.fill}>
            {failed ? (
              <>
                <Text style={styles.msg}>Couldn’t load your trends</Text>
                <View style={styles.cta}>
                  <GradientButton label="Try again" variant="ghost" onPress={() => void load()} />
                </View>
              </>
            ) : (
              <Spinner tint={bio.color.text} />
            )}
          </View>
        ) : days.length === 0 ? (
          <View style={styles.fill}>
            <Text style={styles.msg}>Log a few days and your trends + journal will appear here.</Text>
            <View style={styles.cta}>
              <GradientButton label="Log today" onPress={onLog} />
            </View>
          </View>
        ) : (
          <>
            <GlassSurface style={styles.chartCard} padding={18}>
              <View style={styles.chartHead}>
                <Text style={styles.chartLabel}>Sleep · 7 days</Text>
                {avg !== null ? (
                  <Text style={styles.avg}>
                    avg <Text style={{ color: bio.color.violetLt, fontFamily: fontFamily.bold }}>{fmt(avg)}h</Text>
                  </Text>
                ) : null}
              </View>
              <View style={styles.bars}>
                {bars.map((b, i) => (
                  <View key={i} style={styles.barCol}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: b.value === null ? 6 : Math.max(14, (b.value / max) * 104),
                          backgroundColor: b.value === null ? bio.alpha(0.1) : bio.color.violet,
                          shadowColor: bio.color.violet,
                        },
                      ]}
                    />
                    <Text style={styles.barLabel}>{b.label}</Text>
                  </View>
                ))}
              </View>
            </GlassSurface>

            <Text style={styles.section}>Journal · recent</Text>
            <View style={styles.timeline}>
              <View style={styles.spine} />
              {entries.map((e) => (
                <View key={e.key} style={styles.entry}>
                  <View style={[styles.entryDot, { backgroundColor: e.dot, shadowColor: e.dot }]} />
                  <View style={styles.entryBody}>
                    <View style={styles.entryTop}>
                      <Text style={styles.entryText}>{e.text}</Text>
                      <Text style={styles.entryTime}>{e.time}</Text>
                    </View>
                    {e.tags.length > 0 ? (
                      <View style={styles.tags}>
                        {e.tags.map((t, i) => (
                          <View key={i} style={styles.tag}>
                            <Text style={styles.tagTxt}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, flexGrow: 1 },
  fill: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  title: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: bio.color.text },
  msg: { fontFamily: fontFamily.light, fontSize: 14, lineHeight: 21, color: bio.alpha(0.55), textAlign: "center", maxWidth: 280 },
  cta: { alignSelf: "stretch", marginTop: 18 },
  chartCard: { marginTop: 16 },
  chartHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  chartLabel: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.4, color: bio.alpha(0.55), textTransform: "uppercase" },
  avg: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.5) },
  bars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 124, marginTop: 18, paddingHorizontal: 2 },
  barCol: { alignItems: "center", gap: 8 },
  bar: { width: 26, borderRadius: 8, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  barLabel: { fontFamily: fontFamily.semibold, fontSize: 10, color: bio.alpha(0.4) },
  section: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    textTransform: "uppercase",
    marginTop: 26,
    marginBottom: 14,
  },
  timeline: { position: "relative" },
  spine: { position: "absolute", left: 5, top: 6, bottom: 6, width: 1, backgroundColor: bio.alpha(0.12) },
  entry: { flexDirection: "row", gap: 16, marginBottom: 18 },
  entryDot: { width: 11, height: 11, borderRadius: 6, marginTop: 3, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  entryBody: { flex: 1 },
  entryTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  entryText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text, flexShrink: 1 },
  entryTime: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.4), marginLeft: 8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  tagTxt: { fontFamily: fontFamily.semibold, fontSize: 10.5, color: bio.alpha(0.7) },
});
