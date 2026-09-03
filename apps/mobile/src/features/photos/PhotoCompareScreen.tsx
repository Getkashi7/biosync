/**
 * Compare (design 3A) — two dates, side by side or under a drag slider, with
 * the weight change between them.
 *
 * The delta is computed from the weights actually logged on those two days. If
 * either day has no weight it shows "—" rather than a number: inventing a
 * figure, or borrowing the nearest reading, would attribute a change to a
 * period it didn't happen in — and this is the one screen whose entire job is
 * telling someone how much they changed.
 *
 * The slider is a clipped overlay plus a pan responder, not a library: RN has
 * no clip-path, so the later photo sits in a fixed-width window over the
 * earlier one and only that window's width animates.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic, selectionHaptic } from "../../lib/haptics";
import { fullPhotoDate, tilePhotoDate } from "../../lib/photoFormat";
import { fetchWeightOn } from "./photoMetrics";
import type { Photo } from "./photosApi";

type Mode = "side" | "slider";

export function PhotoCompareScreen({
  photos,
  unit,
  onBack,
}: {
  /** Newest first, as the gallery holds them. */
  photos: Photo[];
  unit: "kg" | "lb";
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("side");
  // Default to the widest span available: the oldest against the newest, which
  // is the comparison someone opening this screen almost always wants.
  const [leftId, setLeftId] = useState(() => photos[photos.length - 1]?.id ?? "");
  const [rightId, setRightId] = useState(() => photos[0]?.id ?? "");
  const [picking, setPicking] = useState<"left" | "right" | null>(null);
  const [weights, setWeights] = useState<Record<string, number | null>>({});
  const [pct, setPct] = useState(56);
  const [sliderW, setSliderW] = useState(0);

  const left = photos.find((p) => p.id === leftId) ?? null;
  const right = photos.find((p) => p.id === rightId) ?? null;

  useEffect(() => {
    for (const p of [left, right]) {
      if (!p || p.takenOn in weights) continue;
      const day = p.takenOn;
      void fetchWeightOn(day)
        .then((w) => setWeights((prev) => ({ ...prev, [day]: w })))
        .catch(() => setWeights((prev) => ({ ...prev, [day]: null })));
    }
  }, [left, right, weights]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          if (sliderW > 0) setPct(clampPct((e.nativeEvent.locationX / sliderW) * 100));
        },
        onPanResponderMove: (e) => {
          if (sliderW > 0) setPct(clampPct((e.nativeEvent.locationX / sliderW) * 100));
        },
      }),
    [sliderW],
  );

  const onSliderLayout = useCallback((e: LayoutChangeEvent) => setSliderW(e.nativeEvent.layout.width), []);

  const leftWeight = left ? (weights[left.takenOn] ?? null) : null;
  const rightWeight = right ? (weights[right.takenOn] ?? null) : null;
  const delta = leftWeight !== null && rightWeight !== null ? rightWeight - leftWeight : null;
  const span = left && right ? weeksBetween(left.takenOn, right.takenOn) : null;

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.violet, size: 460, cx: true, top: -70, stops: [{ o: 0, a: 0.32 }, { o: 46, a: 0.1 }, { o: 72, a: 0 }] },
          { hue: bio.aurora.blue, size: 300, right: -120, bottom: 150, variant: "b", stops: [{ o: 0, a: 0.12 }, { o: 70, a: 0 }] },
        ]}
      />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 112 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={mode !== "slider"}
      >
        <ScreenHeader title="Compare" label="Progress photos" onBack={onBack} />

        <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Comparison mode">
          {([["side", "Side by side"], ["slider", "Slider"]] as const).map(([value, label]) => {
            const on = mode === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  selectionHaptic();
                  setMode(value);
                }}
                style={[styles.segCell, on && styles.segCellOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={label}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.dateRow}>
          <DateButton photo={left} onPress={() => setPicking("left")} />
          <View style={styles.dateDash} />
          <DateButton photo={right} onPress={() => setPicking("right")} />
        </View>

        {mode === "side" ? (
          <View style={styles.sideRow}>
            <SideColumn photo={left} weight={leftWeight} unit={unit} />
            <SideColumn photo={right} weight={rightWeight} unit={unit} />
          </View>
        ) : (
          <>
            <View style={styles.slider} onLayout={onSliderLayout} {...panResponder.panHandlers}>
              <PhotoLayer photo={left} tint={["#28303A", "#151B22"]} />
              {/* The later photo lives in a window whose width is the drag
                  position; RN has no clip-path, so the window does the clipping. */}
              <View style={[styles.sliderWindow, { width: `${pct}%` }]}>
                <View style={{ width: sliderW || undefined, height: "100%" }}>
                  <PhotoLayer photo={right} tint={["#332B33", "#1D1620"]} />
                </View>
              </View>
              <View style={[styles.sliderLine, { left: `${pct}%` }]} pointerEvents="none" />
              <View style={[styles.sliderHandle, { left: `${pct}%` }]} pointerEvents="none">
                <Svg width={16} height={8} viewBox="0 0 16 8" fill="none">
                  <Path d="M5 1 L2 4 L5 7" stroke={bio.alpha(0.8)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M11 1 L14 4 L11 7" stroke={bio.alpha(0.8)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
              {left ? <Text style={[styles.datePill, styles.pillLeft]}>{tilePhotoDate(left.takenOn)}</Text> : null}
              {right ? <Text style={[styles.datePill, styles.pillRight]}>{tilePhotoDate(right.takenOn)}</Text> : null}
            </View>
            <Text style={styles.dragHint}>Drag to compare</Text>
          </>
        )}

        <View style={styles.deltaCard}>
          <View>
            <Text style={styles.deltaLabel}>Weight</Text>
            <Text style={styles.deltaValue}>{formatDelta(delta, unit)}</Text>
          </View>
          <View style={styles.deltaRight}>
            <Text style={styles.deltaLabel}>Span</Text>
            <Text style={styles.spanValue}>{span === null ? "—" : `${span} ${span === 1 ? "week" : "weeks"}`}</Text>
          </View>
        </View>

        {delta === null ? (
          <Text style={styles.noWeight}>
            No weight logged on {leftWeight === null && rightWeight === null ? "either day" : "one of these days"}, so
            there&apos;s no change to show.
          </Text>
        ) : null}
      </ScrollView>

      {picking ? (
        <View style={styles.pickerLayer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicking(null)} accessibilityLabel="Cancel" />
          <View style={[styles.pickerCard, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.pickerTitle}>{picking === "left" ? "Compare from" : "Compare to"}</Text>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {photos.map((p) => {
                const selected = (picking === "left" ? leftId : rightId) === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      selectionHaptic();
                      if (picking === "left") setLeftId(p.id);
                      else setRightId(p.id);
                      setPicking(null);
                    }}
                    style={({ pressed }) => [styles.pickerRow, pressed && styles.dim]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={fullPhotoDate(p.takenOn)}
                  >
                    <Text style={[styles.pickerRowText, selected && styles.pickerRowOn]}>
                      {fullPhotoDate(p.takenOn)}
                    </Text>
                    {selected ? <Text style={styles.pickerTick}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DateButton({ photo, onPress }: { photo: Photo | null; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        pressHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.dateBtn, pressed && styles.dim]}
      accessibilityRole="button"
      accessibilityLabel={photo ? `Change date, currently ${fullPhotoDate(photo.takenOn)}` : "Pick a date"}
    >
      <Text style={styles.dateText}>{photo ? fullPhotoDate(photo.takenOn) : "Pick a date"}</Text>
      <Svg width={8} height={5} viewBox="0 0 8 5" fill="none">
        <Path d="M1 1 L4 4 L7 1" stroke={bio.alpha(0.55)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

function PhotoLayer({ photo, tint }: { photo: Photo | null; tint: [string, string] }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={tint} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      {photo?.url ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

function SideColumn({ photo, weight, unit }: { photo: Photo | null; weight: number | null; unit: "kg" | "lb" }) {
  return (
    <View style={styles.sideCol}>
      <View style={styles.sideFrame}>
        <PhotoLayer photo={photo} tint={["#28303A", "#151B22"]} />
      </View>
      <View style={styles.sideCaption}>
        <Text style={styles.sideDate}>{photo ? tilePhotoDate(photo.takenOn) : "—"}</Text>
        <Text style={styles.sideWeight}>{weight === null ? "—" : formatWeight(weight, unit)}</Text>
      </View>
    </View>
  );
}

function clampPct(v: number): number {
  return Math.max(6, Math.min(94, v));
}

function weeksBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(Math.abs(db - da) / (7 * 24 * 60 * 60 * 1000)));
}

function formatWeight(kg: number, unit: "kg" | "lb"): string {
  return unit === "lb" ? `${(kg * 2.20462).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
}

function formatDelta(deltaKg: number | null, unit: "kg" | "lb"): string {
  if (deltaKg === null) return "—";
  const v = unit === "lb" ? deltaKg * 2.20462 : deltaKg;
  const rounded = Math.abs(v) < 0.05 ? 0 : v;
  // A true minus sign, matching the design — not a hyphen.
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toFixed(1)} ${unit}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  body: { paddingHorizontal: 22 },
  dim: { opacity: 0.75 },

  segment: {
    flexDirection: "row",
    gap: 3,
    height: 40,
    borderRadius: 13,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    padding: 3,
    marginTop: 16,
  },
  segCell: { flex: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  segCellOn: { backgroundColor: bio.violetAlpha(0.17), borderColor: bio.violetAlpha(0.55) },
  segText: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: bio.alpha(0.55) },
  segTextOn: { color: bio.color.violetChip },

  dateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  dateBtn: {
    flex: 1,
    height: 42,
    borderRadius: 13,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dateText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.color.text },
  dateDash: { width: 14, height: 1.5, backgroundColor: bio.alpha(0.35) },

  sideRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  sideCol: { flex: 1, gap: 9 },
  sideFrame: { height: 230, borderRadius: 18, overflow: "hidden" },
  sideCaption: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 3 },
  sideDate: { fontFamily: fontFamily.dot, fontSize: 12.5, color: bio.color.text },
  sideWeight: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.55) },

  slider: { height: 430, borderRadius: 20, overflow: "hidden", marginTop: 16 },
  sliderWindow: { position: "absolute", left: 0, top: 0, bottom: 0, overflow: "hidden" },
  sliderLine: { position: "absolute", top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: bio.alpha(0.75) },
  sliderHandle: {
    position: "absolute",
    top: "50%",
    width: 32,
    height: 32,
    marginLeft: -16,
    marginTop: -16,
    borderRadius: 16,
    backgroundColor: "rgba(11,11,18,0.82)",
    borderWidth: 1,
    borderColor: bio.alpha(0.35),
    alignItems: "center",
    justifyContent: "center",
  },
  datePill: {
    position: "absolute",
    top: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(11,11,18,0.72)",
    borderWidth: 1,
    borderColor: bio.alpha(0.18),
    fontFamily: fontFamily.dot,
    fontSize: 10,
    color: bio.color.text,
  },
  pillLeft: { left: 10 },
  pillRight: { right: 10 },
  dragHint: { fontFamily: fontFamily.light, fontSize: 10.5, color: bio.alpha(0.4), textAlign: "center", marginTop: 9 },

  deltaCard: {
    borderRadius: 18,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deltaRight: { alignItems: "flex-end" },
  deltaLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 9.5,
    letterSpacing: 1.33,
    textTransform: "uppercase",
    color: bio.alpha(0.45),
  },
  deltaValue: { fontFamily: fontFamily.dot, fontSize: 23, color: bio.color.violetChip, marginTop: 4 },
  spanValue: { fontFamily: fontFamily.dotBold, fontSize: 14, color: bio.alpha(0.75), marginTop: 6 },
  noWeight: { fontFamily: fontFamily.light, fontSize: 11.5, lineHeight: 17, color: bio.alpha(0.45), marginTop: 10 },

  pickerLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7,7,12,0.7)", justifyContent: "flex-end" },
  pickerCard: {
    borderTopLeftRadius: bio.radius.sheet,
    borderTopRightRadius: bio.radius.sheet,
    backgroundColor: "#14131C",
    borderTopWidth: 1,
    borderTopColor: bio.alpha(0.14),
    paddingTop: 18,
    paddingHorizontal: 20,
    maxHeight: "62%",
  },
  pickerTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.text, marginBottom: 8 },
  pickerList: { flexGrow: 0 },
  pickerRow: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.06),
  },
  pickerRowText: { fontFamily: fontFamily.regular, fontSize: 14, color: bio.alpha(0.75) },
  pickerRowOn: { fontFamily: fontFamily.semibold, color: bio.color.violetChip },
  pickerTick: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.violetChip },
});
