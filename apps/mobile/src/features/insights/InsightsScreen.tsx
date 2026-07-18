/**
 * Insights — BIOSYNC redesign. Aurora field + a feed of glass "observation" cards,
 * one warm-coach reading per card with its metric-family hue. Full-bleed; clears
 * the floating tab bar. Read-only; the copy is generated server-side.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { GlassSurface } from "../../ui/bio/GlassSurface";
import { Spinner } from "../../ui/Spinner";
import { GradientButton } from "../../ui/GradientButton";
import { bio, fontFamily } from "../../ui/theme";
import { fetchInsights, type Insight, type InsightsResponse } from "./insightsApi";

/** metric-family label + hue per insight kind */
const FAM: Record<Insight["kind"], { label: string; hue: string; rgb: string }> = {
  streak: { label: "Streak", hue: bio.color.coral, rgb: bio.aurora.coral },
  readiness: { label: "Readiness", hue: bio.color.tealLt, rgb: bio.aurora.teal },
  sleep: { label: "Sleep", hue: bio.color.violet, rgb: bio.aurora.violet },
  restingHr: { label: "Heart rate", hue: bio.color.coral, rgb: bio.aurora.coral },
  energySleep: { label: "Energy", hue: bio.color.amber, rgb: bio.aurora.amber },
  nudge: { label: "Nudge", hue: bio.color.blue, rgb: bio.aurora.blue },
};

export function InsightsScreen({ onLog, refreshKey }: { onLog: () => void; refreshKey: number }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await fetchInsights());
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

  const insights = data?.insights ?? [];

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.blue, size: 420, left: -150, top: -100, stops: [{ o: 0, a: 0.24 }, { o: 70, a: 0 }], variant: "a" },
          { hue: bio.aurora.violet, size: 340, right: -130, bottom: 100, stops: [{ o: 0, a: 0.2 }, { o: 70, a: 0 }], variant: "b", delayMs: -5000 },
        ]}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: 130 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />}
      >
        <Text style={styles.title}>Insights</Text>
        <Text style={styles.subtitle}>What your recent days are saying.</Text>

        {data === null && !failed ? (
          <View style={styles.fill}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : data === null && failed ? (
          <View style={styles.fill}>
            <Text style={styles.msg}>Couldn’t load your insights</Text>
            <View style={styles.cta}>
              <GradientButton label="Try again" variant="ghost" onPress={() => void load()} />
            </View>
          </View>
        ) : insights.length === 0 ? (
          <View style={styles.fill}>
            <Text style={styles.msg}>Log a few days of check-ins and your first insights will appear here.</Text>
            <View style={styles.cta}>
              <GradientButton label="Log today" onPress={onLog} />
            </View>
          </View>
        ) : (
          <View style={styles.feed}>
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const fam = FAM[insight.kind];
  return (
    <GlassSurface style={styles.card} padding={20}>
      <AuroraField blobs={[{ hue: fam.rgb, size: 190, right: -70, top: -70, stops: [{ o: 0, a: 0.28 }, { o: 70, a: 0 }] }]} />
      <View style={styles.cardHead}>
        <View style={styles.famRow}>
          <View style={[styles.dot, { backgroundColor: fam.hue }]} />
          <Text style={[styles.fam, { color: fam.hue }]}>{fam.label}</Text>
        </View>
      </View>
      <Text style={styles.head}>{insight.headline}</Text>
      <Text style={styles.body}>{insight.subline}</Text>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink2 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, flexGrow: 1 },
  fill: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  title: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: bio.color.text },
  subtitle: { fontFamily: fontFamily.light, fontSize: 13, color: bio.alpha(0.55), marginTop: 6 },
  msg: { fontFamily: fontFamily.light, fontSize: 14, lineHeight: 21, color: bio.alpha(0.55), textAlign: "center", maxWidth: 280 },
  cta: { alignSelf: "stretch", marginTop: 18 },
  feed: { gap: 12, marginTop: 20 },
  card: { overflow: "hidden" },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  famRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  fam: { fontFamily: fontFamily.bold, fontSize: 10.5, letterSpacing: 1.3, textTransform: "uppercase" },
  head: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 22, color: bio.color.text, marginTop: 12 },
  body: { fontFamily: fontFamily.light, fontSize: 13, lineHeight: 20, color: bio.alpha(0.6), marginTop: 8 },
});
