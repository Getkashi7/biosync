/**
 * Metrics bento — the design's 2-column data grid, one aurora hue per tile:
 * Glucose (sparkline + dotted ring), Time-in-range (gradient bar), Resting HR
 * (sparkline), HRV (dots + trend), Weight (Δ), Spikes. Fed real metric data;
 * a tile shows "—" until that metric has readings.
 */
import { StyleSheet, Text, View } from "react-native";
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
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 26 - 2}`).join(" ");
  return (
    <Svg width="100%" height={h} viewBox="0 0 100 30" preserveAspectRatio="none">
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function GlucoseTile({ m }: { m: BentoMetric }) {
  return (
    <GlassSurface style={[styles.tile, { height: 196 }]} padding={18}>
      <AuroraField blobs={[{ hue: bio.aurora.amber, size: 220, left: -60, bottom: -90, stops: [{ o: 0, a: 0.34 }, { o: 70, a: 0 }] }]} />
      <TileHead hue={bio.color.amber} label="Glucose" />
      <Value v={dec(m.latest)} unit="mg/dL" />
      {m.avg !== null ? (
        <View style={styles.ring}>
          <Svg width={60} height={60} viewBox="0 0 60 60">
            <Circle cx={30} cy={30} r={25} fill="none" stroke={bio.alpha(0.25)} strokeWidth={1.6} strokeLinecap="round" strokeDasharray={[0.5, 3.6]} />
          </Svg>
          <Text style={styles.ringNum}>{dec(m.avg)}</Text>
        </View>
      ) : null}
      <View style={styles.tileFoot}>
        <Sparkline values={m.series} color={bio.color.amber} />
        <Text style={styles.caption}>{m.avg !== null ? `avg ${dec(m.avg)} · 14-day` : "no readings yet"}</Text>
      </View>
    </GlassSurface>
  );
}

function TimeInRangeTile({ pct }: { pct: number | null }) {
  return (
    <GlassSurface style={[styles.tile, { height: 132 }]} padding={18} soft>
      <TileHead hue={bio.color.tealLt2} label="Time in range" />
      <Value v={pct === null ? "—" : String(pct)} unit="%" />
      <View style={styles.bar}>
        <LinearGradient
          colors={[bio.color.blue, bio.color.teal, bio.color.amber, bio.color.coral]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.barTrack}
        />
        {pct !== null ? <View style={[styles.barThumb, { left: `${Math.max(3, Math.min(97, pct))}%` }]} /> : null}
      </View>
    </GlassSurface>
  );
}

function RestingHrTile({ m }: { m: BentoMetric }) {
  return (
    <GlassSurface style={[styles.tile, { height: 150 }]} padding={18} soft>
      <AuroraField blobs={[{ hue: bio.aurora.coral, size: 180, right: -70, top: -70, stops: [{ o: 0, a: 0.32 }, { o: 70, a: 0 }] }]} />
      <TileHead hue={bio.color.coral} label="Resting HR" />
      <Value v={dec(m.latest)} unit="bpm" />
      <View style={styles.tileFoot}>
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
    <GlassSurface style={[styles.tile, { height: 214 }]} padding={18} soft>
      <AuroraField blobs={[{ hue: bio.aurora.blue, size: 230, left: -40, top: -60, stops: [{ o: 0, a: 0.3 }, { o: 70, a: 0 }] }]} />
      <TileHead hue={bio.color.blue} label="HRV" />
      <Value v={dec(m.latest)} unit="ms" />
      <Text style={styles.sub}>variability · {m.series.length} nights</Text>
      <View style={styles.hrvDots}>
        {dots.map((v, i) => {
          const s = 5 + (v / (max || 1)) * 5;
          return <View key={i} style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: bio.color.blueLt, opacity: 0.4 + (v / (max || 1)) * 0.6 }} />;
        })}
      </View>
      {trend !== null ? (
        <Text style={[styles.trend, { color: trend >= 0 ? bio.color.blueLt : bio.color.coral }]}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(Math.round(trend))} ms vs last week
        </Text>
      ) : null}
    </GlassSurface>
  );
}

function WeightTile({ m }: { m: BentoMetric }) {
  const d = m.deltaWeek;
  return (
    <GlassSurface style={[styles.tile, { height: 120 }]} padding={18} soft>
      <TileHead hue={bio.color.teal} label="Weight" />
      <Value v={dec(m.latest, 1)} unit="kg" />
      {d !== null && Math.abs(d) >= 0.1 ? (
        <Text style={[styles.trend, { color: d <= 0 ? bio.color.tealLt2 : bio.color.coral }]}>
          {d <= 0 ? "▼" : "▲"} {Math.abs(d).toFixed(1)} this week
        </Text>
      ) : null}
    </GlassSurface>
  );
}

function SpikesTile({ n }: { n: number }) {
  return (
    <GlassSurface style={[styles.tile, { height: 120 }]} padding={18} soft>
      <AuroraField blobs={[{ hue: bio.aurora.magenta, size: 150, right: -50, bottom: -60, stops: [{ o: 0, a: 0.3 }, { o: 70, a: 0 }] }]} />
      <TileHead hue={bio.color.magenta} label="Spikes" />
      <Value v={String(n)} unit="today" />
      <Text style={styles.caption}>{n === 0 ? "clean day so far" : "above your range"}</Text>
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
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, shadowRadius: 8, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 } },
  label: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1, color: bio.alpha(0.55), textTransform: "uppercase" },
  valRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 10 },
  val: { fontFamily: fontFamily.extrabold, fontSize: 34, letterSpacing: -0.68, color: bio.color.text },
  unit: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.5) },
  ring: { position: "absolute", right: 14, top: 16, width: 60, height: 60, alignItems: "center", justifyContent: "center" },
  ringNum: { position: "absolute", fontFamily: fontFamily.dot, fontSize: 18, letterSpacing: 0.5, color: bio.color.text },
  tileFoot: { position: "absolute", left: 18, right: 18, bottom: 16 },
  caption: { fontFamily: fontFamily.regular, fontSize: 10.5, color: bio.alpha(0.45), marginTop: 5 },
  sub: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.5), marginTop: 4 },
  hrvDots: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18, height: 12 },
  trend: { fontFamily: fontFamily.semibold, fontSize: 11.5, marginTop: 12 },
  bar: { marginTop: 16 },
  barTrack: { height: 3, borderRadius: 2 },
  barThumb: { position: "absolute", top: -4.5, width: 9, height: 9, borderRadius: 2, backgroundColor: bio.color.text, transform: [{ rotate: "45deg" }], marginLeft: -4.5, shadowColor: bio.color.text, shadowRadius: 8, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 } },
});
