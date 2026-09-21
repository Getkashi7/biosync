/**
 * Home — BIOSYNC redesign. Aurora field + a readiness orb hero with a warm-coach
 * line, glass metric chips, and the "Today" cards (open check-in · a live metric).
 * Full-bleed: owns its own safe-area padding and clears the floating tab bar.
 * Data layer unchanged (readiness + streak + trends); presentation-only rebuild.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { GlassSurface } from "../../ui/bio/GlassSurface";
import { ReadinessOrb } from "../../ui/bio/ReadinessOrb";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { ENERGY_WORDS } from "../../lib/ratings";
import { bio, fontFamily } from "../../ui/theme";
import { FlatRow, FlatSection } from "../../ui/bio/FlatRow";
import { useAuth } from "../auth/AuthProvider";
import { fetchDashboard, type DashboardData, type ReadinessToday } from "./dashboardApi";
import { fetchTrends, type Trends } from "./trendsApi";

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateLine(d = new Date()): string {
  return `${WD[d.getDay()]} · ${MO[d.getMonth()]} ${d.getDate()}`;
}

const formatHours = (h: number): string => String(Number(h.toFixed(1)));

/** Status word + accent + coaching copy from the readiness score. */
function look(score: number | null): { status: string; accent: string; rgb: string; line: string } {
  if (score === null)
    return { status: "AWAITING", accent: bio.color.tealLt, rgb: bio.aurora.teal, line: "Log your sleep, energy and heart rate to unlock today’s readiness." };
  if (score >= 80)
    return { status: "PRIMED", accent: bio.color.tealLt, rgb: bio.aurora.teal, line: "Your body says go — today can hold a hard session. Keep water close." };
  if (score >= 60)
    return { status: "READY", accent: bio.color.tealLt2, rgb: bio.aurora.teal, line: "Solid baseline. Train as planned and keep an eye on how you feel." };
  if (score >= 40)
    return { status: "EASE IN", accent: bio.color.amber, rgb: bio.aurora.amber, line: "Take it a touch lighter today — your body’s still catching up." };
  return { status: "REST", accent: bio.color.coral, rgb: bio.aurora.coral, line: "Low reserves. Prioritise rest, food and water today." };
}

type Props = {
  onQuickLog: () => void;
  onCheckin: () => void;
  /** Moved here from You by N2 — building today's plan is a today-action. */
  onCoachPlan: () => void;
  /** The check-in history, moved here from You by N2. */
  onJournal: () => void;
  refreshKey: number;
};

export function DashboardScreen({ onQuickLog, onCheckin, onCoachPlan, onJournal, refreshKey }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      const [d, t] = await Promise.all([fetchDashboard(), fetchTrends()]);
      setData(d);
      setTrends(t);
    } catch (e) {
      setFailed(classifyNetError(e));
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
  const initial = (firstName?.[0] ?? session?.email?.[0] ?? "?").toUpperCase();
  const readiness = data?.readiness ?? null;

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.teal, size: 460, cx: true, top: 60, stops: [{ o: 0, a: 0.32 }, { o: 48, a: 0.16 }, { o: 74, a: 0 }], variant: "a" },
          { hue: bio.aurora.violet, size: 320, left: -120, bottom: 120, stops: [{ o: 0, a: 0.22 }, { o: 70, a: 0 }], variant: "b", delayMs: -6000 },
        ]}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 130 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </Text>
            <Text style={styles.date}>{dateLine()}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{initial}</Text>
          </View>
        </View>

        {data === null && !failed ? (
          <View style={styles.fill}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : data === null && failed ? (
          <View style={styles.fill}>
            <LoadFailed what="your readiness" kind={failed} onRetry={() => void load()} />
          </View>
        ) : readiness ? (
          <Ready readiness={readiness} trends={trends} onCheckin={onCheckin} onQuickLog={onQuickLog} />
        ) : null}

        {/* Outside the readiness branch on purpose: a failed readiness load
            must not take the way to your own journal down with it. */}
        <View style={styles.shortcuts}>
          <FlatSection>
            <FlatRow label="Coach plan" value="Build today's" onPress={onCoachPlan} />
            <FlatRow label="Journal" onPress={onJournal} />
          </FlatSection>
        </View>
      </ScrollView>
    </View>
  );
}

function Ready({
  readiness,
  trends,
  onCheckin,
  onQuickLog,
}: {
  readiness: ReadinessToday;
  trends: Trends | null;
  onCheckin: () => void;
  onQuickLog: () => void;
}) {
  const l = look(readiness.score);
  const c = readiness.components;

  const chips: { dot: string; v: string; u: string }[] = [];
  if (c.sleep) chips.push({ dot: bio.color.violet, v: formatHours(c.sleep.hours), u: "h sleep" });
  if (c.restingHr) chips.push({ dot: bio.color.coral, v: String(Math.round(c.restingHr.current)), u: "bpm" });
  if (c.energyMood) chips.push({ dot: bio.color.amber, v: ENERGY_WORDS[c.energyMood.energy - 1] ?? "—", u: "energy" });

  // Second "Today" card — the best live metric we have.
  const hrStat = trends?.restingHr.stat ?? null;
  const sleepStat = trends?.sleep.stat ?? null;
  const metric =
    c.restingHr || hrStat !== null
      ? { dot: bio.color.coral, label: "Resting HR", val: String(Math.round((c.restingHr?.current ?? hrStat) as number)), unit: "bpm" }
      : sleepStat !== null
        ? { dot: bio.color.violet, label: "Sleep", val: formatHours(sleepStat), unit: "h avg" }
        : null;

  return (
    <>
      <View style={styles.orbBlock}>
        <ReadinessOrb score={readiness.score} status={l.status} accent={l.accent} accentRgb={l.rgb} />
        <Text style={styles.coach}>{l.line}</Text>
      </View>

      {chips.length > 0 ? (
        <View style={styles.chips}>
          {chips.map((chip, i) => (
            <GlassSurface key={i} radius={bio.radius.pill} style={styles.chip} soft>
              <View style={styles.chipRow}>
                <View style={[styles.dot, { backgroundColor: chip.dot }]} />
                <Text style={styles.chipVal}>{chip.v}</Text>
                <Text style={styles.chipUnit}>{chip.u}</Text>
              </View>
            </GlassSurface>
          ))}
        </View>
      ) : null}

      <Text style={styles.section}>Today</Text>
      <View style={styles.todayRow}>
        <Pressable style={styles.checkCardWrap} onPress={onCheckin} accessibilityRole="button">
          <GlassSurface style={styles.todayCard} padding={18}>
            <AuroraField
              blobs={[{ hue: bio.aurora.magenta, size: 150, right: -50, top: -50, stops: [{ o: 0, a: 0.3 }, { o: 70, a: 0 }] }]}
            />
            <Text style={styles.cardTitle}>Daily check-in</Text>
            <Text style={styles.cardSub}>Sleep, energy, mood — 20 seconds.</Text>
            <View style={styles.cardCta}>
              <Text style={[styles.cardCtaTxt, { color: bio.color.magLt }]}>Check in</Text>
              <Text style={[styles.arrow, { color: bio.color.magLt }]}>›</Text>
            </View>
          </GlassSurface>
        </Pressable>

        {metric ? (
          <Pressable style={styles.metricCardWrap} onPress={onQuickLog} accessibilityRole="button">
            <GlassSurface style={styles.todayCard} padding={18} soft>
              <View style={styles.metricHead}>
                <View style={[styles.dot, { backgroundColor: metric.dot }]} />
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
              <View style={styles.metricValRow}>
                <Text style={styles.metricVal}>{metric.val}</Text>
                <Text style={styles.metricUnit}>{metric.unit}</Text>
              </View>
            </GlassSurface>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink2 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, flexGrow: 1 },
  // The page already pads 24; FlatSection brings N2's own gutter, so undo one.
  shortcuts: { marginHorizontal: -bio.flat.gutter, marginTop: 24 },
  fill: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  greeting: { fontFamily: fontFamily.bold, fontSize: 22, letterSpacing: -0.22, color: bio.color.text },
  date: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.5, color: bio.alpha(0.45), textTransform: "uppercase", marginTop: 4 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { fontFamily: fontFamily.bold, fontSize: 14, color: bio.alpha(0.9) },
  orbBlock: { alignItems: "center", marginTop: 18 },
  coach: {
    fontFamily: fontFamily.light,
    fontSize: 13.5,
    lineHeight: 21,
    color: bio.alpha(0.65),
    textAlign: "center",
    maxWidth: 300,
    marginTop: 14,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 24, justifyContent: "center" },
  chip: { height: 44, justifyContent: "center" },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipVal: { fontFamily: fontFamily.bold, fontSize: 15, letterSpacing: -0.15, color: bio.color.text },
  chipUnit: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.5), marginLeft: -4 },
  section: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    textTransform: "uppercase",
    marginTop: 26,
    marginBottom: 10,
  },
  todayRow: { flexDirection: "row", gap: 12 },
  checkCardWrap: { flex: 1.2 },
  metricCardWrap: { flex: 1 },
  todayCard: { minHeight: 128, overflow: "hidden" },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.text },
  cardSub: { fontFamily: fontFamily.light, fontSize: 12, lineHeight: 18, color: bio.alpha(0.55), marginTop: 8 },
  cardCta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 16 },
  cardCtaTxt: { fontFamily: fontFamily.bold, fontSize: 12 },
  arrow: { fontFamily: fontFamily.bold, fontSize: 15, marginTop: -1 },
  metricHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  metricLabel: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.1, color: bio.alpha(0.55), textTransform: "uppercase" },
  metricValRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 10 },
  metricVal: { fontFamily: fontFamily.extrabold, fontSize: 32, letterSpacing: -0.64, color: bio.color.text },
  metricUnit: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.5) },
});
