/**
 * Metrics bento — the design's 2-column data grid, one aurora hue per tile:
 * Glucose (sparkline + slowly-rotating dotted avg ring), Time-in-range (gradient
 * bar), Resting HR (sparkline), HRV (dots + trend), Weight (Δ), Spikes. Tiles use
 * a flex column so the footer sits at the bottom; a tile shows "—" until it has
 * readings.
 */
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Polyline } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { GlassSurface } from "../../ui/bio/GlassSurface";
import { bio, fontFamily } from "../../ui/theme";
import type { BentoData, BentoMetric } from "./bentoApi";

const dec = (v: number | null, d = 0): string => (v === null ? "—" : v.toFixed(d));

function TileHead({ hue, label }: { hue: string; label: string }) {
  return (
    <View style={styles.head}>
      <View style={[styles.dot, { backgroundColor: hue, shadowColor: hue }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function Value({ v, unit }: { v: string; unit: string }) {
  return (
    <View style={styles.valRow}>
      <Text style={styles.val}>{v}</Text>
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

function Sparkline({ values, color, h = 30 }: { values: number[]; color: string; h?: number }) {
  if (values.length < 2) return <View style={{ height: h }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(" ");
  return (
    <Svg width="100%" height={h} viewBox="0 0 100 30" preserveAspectRatio="none">
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Slowly-rotating dotted ring with a static centred number (glucose avg). */
function RotatingRing({ avg }: { avg: string }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 70000, easing: Easing.linear }), -1, false);
  }, [rot]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <View style={styles.ring}>
      <Animated.View style={[StyleSheet.absoluteFill, spin]}>
        <Svg width={56} height={56} viewBox="0 0 56 56">
          <Circle cx={28} cy={28} r={23} fill="none" stroke={bio.alpha(0.3)} strokeWidth={1.6} strokeLinecap="round" strokeDasharray={[0.5, 3.4]} />
        </Svg>
      </Animated.View>
      <Text style={styles.ringNum}>{avg}</Text>
    </View>
  );
}

function GlucoseTile({ m }: { m: BentoMetric }) {
  return (
    <GlassSurface fill style={[styles.tile, { height: 196 }]}>
      <AuroraField blobs={[{ hue: bio.aurora.amber, size: 220, left: -60, bottom: -90, stops: [{ o: 0, a: 0.34 }, { o: 70, a: 0 }] }]} />
      <View style={styles.pad}>
        <TileHead hue={bio.color.amber} label="Glucose" />
        <Value v={dec(m.latest)} unit="mg/dL" />
        <View style={styles.grow} />
        <Sparkline values={m.series} color={bio.color.amber} />
        <Text style={styles.caption}>{m.avg !== null ? `avg ${dec(m.avg)} · 14-day` : "no readings yet"}</Text>
      </View>
      {m.avg !== null ? <RotatingRing avg={dec(m.avg)} /> : null}
    </GlassSurface>
  );
}

function TimeInRangeTile({ pct }: { pct: number | null }) {
  return (
    <GlassSurface fill soft style={[styles.tile, { height: 132 }]}>
      <View style={styles.pad}>
        <TileHead hue={bio.color.tealLt2} label="Time in range" />
        <Value v={pct === null ? "—" : String(pct)} unit="%" />
        <View style={styles.grow} />
        <View style={styles.bar}>
          <LinearGradient colors={[bio.color.blue, bio.color.teal, bio.color.amber, bio.color.coral]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.barTrack} />
          {pct !== null ? <View style={[styles.barThumb, { left: `${Math.max(3, Math.min(97, pct))}%` }]} /> : null}
        </View>
      </View>
    </GlassSurface>
  );
}

function RestingHrTile({ m }: { m: BentoMetric }) {
  return (
    <GlassSurface fill soft style={[styles.tile, { height: 150 }]}>
      <AuroraField blobs={[{ hue: bio.aurora.coral, size: 180, right: -70, top: -70, stops: [{ o: 0, a: 0.32 }, { o: 70, a: 0 }] }]} />
      <View style={styles.pad}>
        <TileHead hue={bio.color.coral} label="Resting HR" />
        <Value v={dec(m.latest)} unit="bpm" />
        <View style={styles.grow} />
        <Sparkline values={m.series} color={bio.color.coral} h={26} />
      </View>
    </GlassSurface>
  );
}

function HrvTile({ m }: { m: BentoMetric }) {
  const dots = m.series.slice(-9);
  const max = dots.length ? Math.max(...dots) : 1;
  const trend = m.deltaWeek;
  return (
    <GlassSurface fill soft style={[styles.tile, { height: 214 }]}>
      <AuroraField blobs={[{ hue: bio.aurora.blue, size: 230, left: -40, top: -60, stops: [{ o: 0, a: 0.3 }, { o: 70, a: 0 }] }]} />
      <View style={styles.pad}>
        <TileHead hue={bio.color.blue} label="HRV" />
        <Value v={dec(m.latest)} unit="ms" />
        <Text style={styles.sub}>variability · {m.series.length} nights</Text>
        <View style={styles.hrvDots}>
          {dots.map((v, i) => {
            const s = 5 + (v / (max || 1)) * 5;
            return <View key={i} style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: bio.color.blueLt, opacity: 0.4 + (v / (max || 1)) * 0.6 }} />;
          })}
        </View>
        <View style={styles.grow} />
        {trend !== null ? (
          <Text style={[styles.trend, { color: trend >= 0 ? bio.color.blueLt : bio.color.coral }]}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(Math.round(trend))} ms vs last week
          </Text>
        ) : null}
      </View>
    </GlassSurface>
  );
}

function WeightTile({ m }: { m: BentoMetric }) {
  const d = m.deltaWeek;
  return (
    <GlassSurface fill soft style={[styles.tile, { height: 120 }]}>
      <View style={styles.pad}>
        <TileHead hue={bio.color.teal} label="Weight" />
        <Value v={dec(m.latest, 1)} unit="kg" />
        <View style={styles.grow} />
        {d !== null && Math.abs(d) >= 0.1 ? (
          <Text style={[styles.trend, { color: d <= 0 ? bio.color.tealLt2 : bio.color.coral }]}>
            {d <= 0 ? "▼" : "▲"} {Math.abs(d).toFixed(1)} this week
          </Text>
        ) : null}
      </View>
    </GlassSurface>
  );
}

function SpikesTile({ n }: { n: number }) {
  return (
    <GlassSurface fill soft style={[styles.tile, { height: 120 }]}>
      <AuroraField blobs={[{ hue: bio.aurora.magenta, size: 150, right: -50, bottom: -60, stops: [{ o: 0, a: 0.3 }, { o: 70, a: 0 }] }]} />
      <View style={styles.pad}>
        <TileHead hue={bio.color.magenta} label="Spikes" />
        <Value v={String(n)} unit="today" />
        <View style={styles.grow} />
        <Text style={styles.caption}>{n === 0 ? "clean day so far" : "above your range"}</Text>
      </View>
    </GlassSurface>
  );
}

export function MetricsBento({ data }: { data: BentoData }) {
  return (
    <View style={styles.grid}>
      <View style={styles.col}>
        <GlucoseTile m={data.glucose} />
        <RestingHrTile m={data.restingHr} />
        <WeightTile m={data.weight} />
      </View>
      <View style={styles.col}>
        <TimeInRangeTile pct={data.timeInRange} />
        <HrvTile m={data.hrv} />
        <SpikesTile n={data.spikesToday} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 12 },
  col: { flex: 1, gap: 12 },
  tile: { overflow: "hidden" },
  pad: { flex: 1, padding: 18 },
  grow: { flex: 1, minHeight: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, shadowRadius: 8, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 } },
  label: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1, color: bio.alpha(0.55), textTransform: "uppercase" },
  valRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 10 },
  val: { fontFamily: fontFamily.extrabold, fontSize: 34, letterSpacing: -0.68, color: bio.color.text },
  unit: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.5) },
  ring: { position: "absolute", right: 16, top: 16, width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  ringNum: { fontFamily: fontFamily.dot, fontSize: 17, letterSpacing: 0.5, color: bio.color.text },
  caption: { fontFamily: fontFamily.regular, fontSize: 10.5, color: bio.alpha(0.45), marginTop: 5 },
  sub: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.5), marginTop: 4 },
  hrvDots: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, height: 12 },
  trend: { fontFamily: fontFamily.semibold, fontSize: 11.5 },
  bar: {},
  barTrack: { height: 3, borderRadius: 2 },
  barThumb: { position: "absolute", top: -4.5, width: 9, height: 9, borderRadius: 2, backgroundColor: bio.color.text, transform: [{ rotate: "45deg" }], marginLeft: -4.5, shadowColor: bio.color.text, shadowRadius: 8, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 } },
});
