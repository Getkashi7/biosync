/**
 * Trends tab — BIOSYNC redesign. Aurora field + the Metrics bento grid (per the
 * design's "DATA" section) and, below it, a journal timeline of recent check-ins
 * + metrics on a dotted spine. Full-bleed; clears the floating tab bar.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { GradientButton } from "../../ui/GradientButton";
import { formatTime } from "../../lib/date";
import { pressHaptic, selectionHaptic } from "../../lib/haptics";
import { ENERGY_WORDS, MOOD_WORDS } from "../../lib/ratings";
import { METRIC_META, FALLBACK_META } from "../../lib/metricMeta";
import { bio, fontFamily } from "../../ui/theme";
import { fetchMetricsBento, type BentoData } from "../metrics/bentoApi";
import { MetricsBento, type Range } from "../metrics/MetricsBento";
import { fetchTimelinePage, type TimelineDay } from "./timelineApi";

const fmt = (v: number): string => String(Number(v.toFixed(1)));

const METRIC_HUE: Record<string, string> = {
  RESTING_HR: bio.color.coral,
  HRV: bio.color.blue,
  WEIGHT: bio.color.tealLt2,
  GLUCOSE: bio.color.amber,
  SLEEP_HOURS: bio.color.violet,
};
const hueFor = (t: string): string => METRIC_HUE[t] ?? bio.color.blue;

type JEntry = { key: string; dot: string; text: string; time: string; tags: string[] };
/**
 * Flatten day groups into journal entries.
 *
 * This used to take only the first 4 days and the first 8 entries, which meant
 * the screen threw away almost everything it had just fetched — the journal
 * quietly stopped a few days back regardless of how long someone had been
 * logging. It renders the whole loaded range now, and older ranges are fetched
 * on demand.
 */
function journal(days: TimelineDay[]): JEntry[] {
  const out: JEntry[] = [];
  for (const day of days) {
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
      out.push({ key: `m-${day.date}-${i}`, dot: hueFor(m.type), text: `${meta.name} · ${fmt(m.value)} ${meta.unit}`.trim(), time: formatTime(m.recordedAt), tags: [] });
    });
  }
  return out;
}

export function TimelineScreen({
  onLog,
  refreshKey,
  onBack,
}: {
  onLog: () => void;
  refreshKey: number;
  /** Absent while this is a tab root; present once it is pushed. */
  onBack?: (() => void) | undefined;
}) {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<TimelineDay[] | null>(null);
  const [bento, setBento] = useState<BentoData | null>(null);
  const [range, setRange] = useState<Range>("day");
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** where the next older window starts; null once history is exhausted */
  const [older, setOlder] = useState<Date | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const pickRange = (r: Range) => {
    if (r === range) return;
    selectionHaptic();
    setRange(r);
  };

  const load = useCallback(async () => {
    setFailed(null);
    try {
      const [page, b] = await Promise.all([fetchTimelinePage(), fetchMetricsBento()]);
      setDays(page.days);
      setOlder(page.olderCursor);
      setBento(b);
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, []);

  /** Append the next window back. Appends rather than replaces, so scroll
   *  position and everything already read stay put. */
  const loadOlder = useCallback(async () => {
    if (!older || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchTimelinePage(older);
      setDays((prev) => [...(prev ?? []), ...page.days]);
      setOlder(page.olderCursor);
    } catch {
      // Keep what's already on screen; the button stays for another attempt.
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, older]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const entries = days ? journal(days) : [];
  const empty = days !== null && bento !== null && !bento.hasAny && (days.length === 0 || entries.length === 0);

  return (
    <View style={styles.root}>
      <AuroraField blobs={[{ hue: bio.aurora.teal, size: 400, right: -140, top: -120, stops: [{ o: 0, a: 0.22 }, { o: 70, a: 0 }] }]} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: 130 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />}
      >
        <View style={styles.header}>
          {/* Only when pushed. As a tab root there was nothing to go back to. */}
          {onBack ? (
            <Pressable
              onPress={() => {
                pressHaptic();
                onBack();
              }}
              hitSlop={16}
              style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={styles.backChev}>‹</Text>
            </Pressable>
          ) : null}
          <Text style={styles.title}>Metrics</Text>
          <View style={styles.toggle}>
            {(["day", "week"] as const).map((r) => {
              const on = range === r;
              return (
                <Pressable key={r} onPress={() => pickRange(r)} style={[styles.tog, on && styles.togOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={on ? styles.togTxtOn : styles.togTxt}>{r === "day" ? "Day" : "Week"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {days === null ? (
          <View style={styles.fill}>
            {failed ? (
              <LoadFailed what="your metrics" kind={failed ?? "offline"} onRetry={() => void load()} />
            ) : (
              <Spinner tint={bio.color.text} />
            )}
          </View>
        ) : empty ? (
          <View style={styles.fill}>
            <Text style={styles.msg}>Log a few days and your metrics + journal will appear here.</Text>
            <View style={styles.cta}>
              <GradientButton label="Log today" onPress={onLog} />
            </View>
          </View>
        ) : (
          <>
            {bento ? <MetricsBento data={bento} range={range} /> : null}

            {entries.length > 0 ? (
              <>
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

                {older ? (
                  <Pressable
                    onPress={() => void loadOlder()}
                    disabled={loadingOlder}
                    style={({ pressed }) => [styles.older, pressed && styles.olderPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Show earlier entries"
                    accessibilityState={{ disabled: loadingOlder, busy: loadingOlder }}
                  >
                    <Text style={styles.olderTxt}>
                      {loadingOlder ? "Loading…" : "Show earlier"}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.olderEnd}>That's the start of your journal.</Text>
                )}
              </>
            ) : null}
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
  older: {
    alignSelf: "center",
    marginTop: 18,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
    backgroundColor: bio.color.glassLo,
  },
  olderPressed: { opacity: 0.6 },
  olderTxt: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.alpha(0.75) },
  olderEnd: {
    fontFamily: fontFamily.light,
    fontSize: 11.5,
    color: bio.alpha(0.35),
    textAlign: "center",
    marginTop: 18,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12 },
  back: { marginRight: -4 },
  backPressed: { transform: [{ scale: 0.97 }] },
  backChev: { fontFamily: fontFamily.regular, fontSize: 26, lineHeight: 28, color: bio.alpha(0.62) },
  title: { flex: 1, fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: bio.color.text },
  toggle: { flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: bio.color.border2, gap: 6 },
  tog: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
  togOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  togTxt: { fontFamily: fontFamily.medium, fontSize: 12, color: bio.alpha(0.5) },
  togTxtOn: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.color.text },
  msg: { fontFamily: fontFamily.light, fontSize: 14, lineHeight: 21, color: bio.alpha(0.55), textAlign: "center", maxWidth: 280 },
  cta: { alignSelf: "stretch", marginTop: 18 },
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
