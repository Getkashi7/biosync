/**
 * Nutrition — the macro day (design 1A/1B/1C). Three states off one fetch:
 *  · loading  — dotted ring tracks turning behind shimmering skeletons;
 *  · empty    — counter-rotating dotted rings around a breathing amber glow;
 *  · today    — a counting-up calorie readout, the three macro rings, the micro
 *               bento and the amber coach-read card.
 *
 * Every number shown is the user's own: totals come from their logged meals and
 * the coach read is derived (`nutritionRead`), never generated — so nothing here
 * can invent a value. Non-diagnostic; the disclaimer chip is always present.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { bio, fontFamily, motion } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { dateLabel, groupThousands } from "../../lib/format";
import { MacroRing } from "./MacroRing";
import { fetchDay, type NutritionDay, type NutritionRead } from "./nutritionApi";

const COUNT_MS = 1500;

type Props = {
  onBack: () => void;
  onAddMeal: () => void;
  onOpenLog: () => void;
  refreshKey: number;
};

export function NutritionScreen({ onBack, onAddMeal, onOpenLog, refreshKey }: Props) {
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState<NutritionDay | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setDay(await fetchDay());
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

  const empty = day !== null && day.mealCount === 0;

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={
          empty
            ? [
                { hue: bio.aurora.amber, size: 520, cx: true, top: 120, stops: [{ o: 0, a: 0.4 }, { o: 46, a: 0.14 }, { o: 72, a: 0 }], variant: "a" },
                { hue: bio.aurora.amber, size: 260, left: -100, bottom: 80, stops: [{ o: 0, a: 0.14 }, { o: 70, a: 0 }], variant: "b", delayMs: -6000 },
              ]
            : [
                { hue: bio.aurora.amber, size: 470, cx: true, top: -30, stops: [{ o: 0, a: 0.36 }, { o: 46, a: 0.13 }, { o: 72, a: 0 }], variant: "a" },
                { hue: bio.aurora.teal, size: 300, right: -120, bottom: 120, stops: [{ o: 0, a: 0.16 }, { o: 70, a: 0 }], variant: "b", delayMs: -5000 },
              ]
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />
        }
      >
        <ScreenHeader title="Nutrition" label={dateLabel()} onBack={onBack} />

        {day === null ? (
          failed ? (
            <View style={styles.centreBlock}>
              <Text style={styles.emptyTitle}>Couldn’t load your day</Text>
              <Pressable onPress={() => void load()} style={({ pressed }) => [styles.ctaPill, pressed && styles.pressed]}>
                <View style={styles.ctaDot} />
                <Text style={styles.ctaPillText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <LoadingState />
          )
        ) : empty ? (
          <EmptyState onAdd={onAddMeal} />
        ) : (
          <TodayState day={day} read={day.read} onOpenLog={onOpenLog} />
        )}
      </ScrollView>
    </View>
  );
}

// ── Today (1A) ───────────────────────────────────────────────────────────────
function TodayState({
  day,
  read,
  onOpenLog,
}: {
  day: NutritionDay;
  read: NutritionRead | null;
  onOpenLog: () => void;
}) {
  const [kcal, setKcal] = useState(0);
  const raf = useRef(0);
  const target = day.totals.calories;

  // count-up, matching the design's 1.5s ease-out
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / COUNT_MS);
      setKcal(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);

  const left = day.remainingCalories;
  const fiberPct = day.progress.fiber;

  return (
    <>
      <Pressable onPress={onOpenLog} style={({ pressed }) => pressed && styles.pressed} accessibilityRole="button">
        <Text style={styles.sectionLabel}>CALORIES</Text>
        <View style={styles.kcalRow}>
          <Text style={styles.kcal}>{groupThousands(kcal)}</Text>
          <Text style={styles.kcalTarget}>/ {groupThousands(day.targets.calories)} kcal</Text>
        </View>
        <Text style={styles.pace}>
          {left >= 0 ? `${groupThousands(left)} left · on pace for the day` : `${groupThousands(-left)} over today’s target`}
        </Text>
      </Pressable>

      <View style={styles.ringRow}>
        <MacroRing label="Protein" value={day.totals.proteinG} target={day.targets.proteinG} progress={day.progress.protein} delayMs={250} />
        <MacroRing label="Carbs" value={day.totals.carbsG} target={day.targets.carbsG} progress={day.progress.carbs} delayMs={400} />
        <MacroRing label="Fat" value={day.totals.fatG} target={day.targets.fatG} progress={day.progress.fat} delayMs={550} />
      </View>

      <Text style={[styles.sectionLabel, styles.microsLabel]}>MICROS</Text>
      <View style={styles.microRow}>
        <MicroTile
          name="Fiber"
          status={fiberPct >= 0.8 ? "on track" : "low"}
          onTrack={fiberPct >= 0.8}
        />
        <View style={styles.microMore}>
          <Text style={styles.microMoreText}>More micros soon</Text>
        </View>
      </View>

      {read ? <CoachRead read={read} /> : null}
    </>
  );
}

function MicroTile({ name, status, onTrack }: { name: string; status: string; onTrack: boolean }) {
  return (
    <View style={styles.microTile}>
      <Text style={styles.microName}>{name}</Text>
      <View style={styles.microStatusRow}>
        <View style={onTrack ? styles.microDotOn : styles.microDotLow} />
        <Text style={[styles.microStatus, { color: onTrack ? bio.color.tealLt2 : bio.color.amberLt }]}>{status}</Text>
      </View>
    </View>
  );
}

function CoachRead({ read }: { read: NutritionRead }) {
  return (
    <View style={styles.coachCard}>
      <View style={styles.coachBloom} />
      <View style={styles.coachHead}>
        <View style={styles.coachFam}>
          <View style={styles.coachDot} />
          <Text style={styles.coachLabel}>COACH READ</Text>
        </View>
        <View style={styles.confRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.confDot, i < read.confidence ? styles.confOn : styles.confOff]} />
          ))}
        </View>
      </View>
      <Text style={styles.coachHeadline}>{read.headline}</Text>
      <Text style={styles.coachDetail}>{read.detail}</Text>
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>Wellness guidance, not medical advice</Text>
      </View>
    </View>
  );
}

// ── Empty (1B) ───────────────────────────────────────────────────────────────
const EMPTY_SIZE = 200;

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const spin = useSharedValue(0);
  const spinBack = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 70_000, easing: Easing.linear }), -1, false);
    spinBack.value = withRepeat(withTiming(-360, { duration: 90_000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [spin, spinBack, pulse]);

  const outerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spinBack.value}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.5, 0.95]) }));

  const outerC = 2 * Math.PI * 94;
  const innerC = 2 * Math.PI * 63;

  return (
    <View style={styles.centreBlock}>
      <View style={styles.emptyOrb}>
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
          <Svg width={EMPTY_SIZE} height={EMPTY_SIZE}>
            <Defs>
              <RadialGradient id="emptyGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={bio.color.amber} stopOpacity={0.3} />
                <Stop offset="70%" stopColor={bio.color.amber} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={EMPTY_SIZE / 2} cy={EMPTY_SIZE / 2} r={EMPTY_SIZE / 2 - 56} fill="url(#emptyGlow)" />
          </Svg>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, outerStyle]}>
          <Svg width={EMPTY_SIZE} height={EMPTY_SIZE}>
            <Circle
              cx={EMPTY_SIZE / 2}
              cy={EMPTY_SIZE / 2}
              r={94}
              fill="none"
              stroke={bio.alpha(0.26)}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeDasharray={[(0.4 / 100) * outerC, (3 / 100) * outerC]}
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, innerStyle]}>
          <Svg width={EMPTY_SIZE} height={EMPTY_SIZE}>
            <Circle
              cx={EMPTY_SIZE / 2}
              cy={EMPTY_SIZE / 2}
              r={63}
              fill="none"
              stroke={bio.amberAlpha(0.55)}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeDasharray={[(0.45 / 100) * innerC, (3.6 / 100) * innerC]}
            />
          </Svg>
        </Animated.View>

        <View style={styles.emptyCentre}>
          <Text style={styles.emptyZero}>0</Text>
        </View>
      </View>

      <Text style={styles.emptyTitle}>Log a meal and your day fills in.</Text>
      <Text style={styles.emptySub}>One line is all it takes — the coach estimates calories, macros and micros.</Text>

      <Pressable
        onPress={() => {
          pressHaptic();
          onAdd();
        }}
        style={({ pressed }) => [styles.ctaPill, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <View style={styles.ctaDot} />
        <Text style={styles.ctaPillText}>Add breakfast</Text>
      </Pressable>
    </View>
  );
}

// ── Loading (1C) ─────────────────────────────────────────────────────────────
function LoadingState() {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [shimmer]);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: interpolate(shimmer.value, [0, 1], [0.35, 0.75]) }));

  return (
    <>
      <Text style={styles.sectionLabel}>CALORIES</Text>
      <Animated.View style={[styles.skelKcal, shimmerStyle]} />
      <Animated.View style={[styles.skelLine, shimmerStyle]} />
      <View style={styles.ringRow}>
        <MacroRing label="Protein" value={0} target={0} progress={0} />
        <MacroRing label="Carbs" value={0} target={0} progress={0} />
        <MacroRing label="Fat" value={0} target={0} progress={0} />
      </View>
      <Text style={[styles.sectionLabel, styles.microsLabel]}>MICROS</Text>
      <View style={styles.microRow}>
        <Animated.View style={[styles.skelTile, shimmerStyle]} />
        <Animated.View style={[styles.skelTile, shimmerStyle]} />
      </View>
      <Text style={styles.estimating}>Reading your day…</Text>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, flexGrow: 1 },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 20,
  },
  microsLabel: { marginTop: 22, marginBottom: 10 },

  kcalRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  kcal: {
    fontFamily: fontFamily.dot,
    fontSize: 54,
    letterSpacing: 2.2,
    color: bio.color.text,
    textShadowColor: bio.amberAlpha(0.4),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 32,
  },
  kcalTarget: { fontFamily: fontFamily.medium, fontSize: 12.5, color: bio.alpha(0.4) },
  pace: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.55), marginTop: 8 },

  // the ring labels sit in flow beneath each gauge, so no extra bottom gap
  ringRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, marginBottom: 4, paddingHorizontal: 4 },

  microRow: { flexDirection: "row", gap: 10 },
  microTile: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    padding: 12,
    gap: 8,
  },
  microName: { fontFamily: fontFamily.semibold, fontSize: 11, color: bio.alpha(0.65) },
  microStatusRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  microDotOn: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: bio.color.teal,
    shadowColor: bio.color.teal,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  microDotLow: { width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.5, borderColor: bio.color.amber },
  microStatus: { fontFamily: fontFamily.semibold, fontSize: 10.5 },
  microMore: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: bio.alpha(0.16),
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 58,
  },
  microMoreText: { fontFamily: fontFamily.semibold, fontSize: 10.5, color: bio.alpha(0.45) },

  coachCard: {
    marginTop: "auto",
    borderRadius: bio.radius.card,
    backgroundColor: bio.amberAlpha(0.11),
    borderWidth: 1,
    borderColor: bio.amberAlpha(0.28),
    padding: 18,
    overflow: "hidden",
  },
  coachBloom: {
    position: "absolute",
    width: 190,
    height: 190,
    right: -70,
    top: -70,
    borderRadius: 95,
    backgroundColor: bio.color.amber,
    opacity: 0.12,
  },
  coachHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  coachFam: { flexDirection: "row", alignItems: "center", gap: 8 },
  coachDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: bio.color.amber,
    shadowColor: bio.color.amber,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  coachLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, letterSpacing: 1.26, color: bio.color.amberLt },
  confRow: { flexDirection: "row", gap: 4 },
  confDot: { width: 5, height: 5, borderRadius: 2.5 },
  confOn: { backgroundColor: bio.alpha(0.9) },
  confOff: { backgroundColor: bio.alpha(0.25) },
  coachHeadline: { fontFamily: fontFamily.semibold, fontSize: 14.5, lineHeight: 21, color: bio.color.text, marginTop: 11 },
  coachDetail: { fontFamily: fontFamily.light, fontSize: 12.5, lineHeight: 19, color: bio.alpha(0.6), marginTop: 6 },
  disclaimer: {
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    marginTop: 13,
  },
  disclaimerText: { fontFamily: fontFamily.semibold, fontSize: 9.5, letterSpacing: 0.5, color: bio.alpha(0.45) },

  centreBlock: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 20 },
  emptyOrb: { width: EMPTY_SIZE, height: EMPTY_SIZE, alignItems: "center", justifyContent: "center" },
  emptyCentre: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  emptyZero: { fontFamily: fontFamily.dot, fontSize: 26, letterSpacing: 2, color: bio.alpha(0.55) },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    letterSpacing: -0.22,
    lineHeight: 29,
    color: bio.color.text,
    textAlign: "center",
    maxWidth: 250,
    marginTop: 30,
  },
  emptySub: {
    fontFamily: fontFamily.light,
    fontSize: 13.5,
    lineHeight: 21,
    color: bio.alpha(0.55),
    textAlign: "center",
    maxWidth: 270,
    marginTop: 10,
  },
  ctaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 46,
    paddingLeft: 16,
    paddingRight: 20,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.07),
    borderWidth: 1,
    borderColor: bio.color.border,
    marginTop: 26,
  },
  ctaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: bio.color.amber,
    shadowColor: bio.color.amber,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  ctaPillText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.alpha(0.85) },

  skelKcal: { height: 54, width: 180, borderRadius: 12, backgroundColor: bio.alpha(0.08), marginTop: 6 },
  skelLine: { height: 12, width: 210, borderRadius: 6, backgroundColor: bio.alpha(0.06), marginTop: 12 },
  skelTile: { flex: 1, minHeight: 58, borderRadius: 20, backgroundColor: bio.alpha(0.06) },
  estimating: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: bio.alpha(0.45),
    textAlign: "center",
    marginTop: "auto",
    marginBottom: 8,
  },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
