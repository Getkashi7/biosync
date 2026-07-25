/**
 * Today's doses (design 1B) — the stack laid out on a dashed day-spine, one
 * section per slot (Morning / Pre-workout / Evening). Tapping a row ticks that
 * dose: the target fills magenta with a glow and the checkmark pops in, while
 * the name and dose fade back to show it's done.
 *
 * The tick is optimistic — local state flips immediately so it feels instant,
 * and reverts if the server write fails.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { bio, fontFamily, motion } from "../../ui/theme";
import { pressHaptic, successHaptic } from "../../lib/haptics";
import { fetchDay, setTaken, type ScheduledDose, type SupplementDay, type Timing } from "./supplementsApi";

/** the indicative time shown beside each slot */
const SLOT_TIME: Record<Timing, string> = { AM: "08:00", PRE: "17:30", PM: "21:30" };

export function DoseStripScreen({
  onBack,
  onChanged,
  refreshKey,
}: {
  onBack: () => void;
  onChanged: () => void;
  refreshKey: number;
}) {
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState<SupplementDay | null>(null);
  /** local overrides so a tap feels instant: "id:timing" → taken */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setDay(await fetchDay());
      setPending({});
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const toggle = useCallback(
    async (dose: ScheduledDose) => {
      const key = `${dose.id}:${dose.timing}`;
      const current = pending[key] ?? dose.taken;
      const next = !current;
      pressHaptic();
      setPending((p) => ({ ...p, [key]: next }));
      if (next) successHaptic();
      try {
        await setTaken(dose.id, dose.timing, next);
        onChanged();
      } catch {
        // put it back the way it was
        setPending((p) => ({ ...p, [key]: current }));
      }
    },
    [pending, onChanged],
  );

  const isTaken = (d: ScheduledDose) => pending[`${d.id}:${d.timing}`] ?? d.taken;

  const slots = day?.slots ?? [];
  const due = day?.due ?? 0;
  const done = slots.reduce((n, s) => n + s.doses.filter(isTaken).length, 0);
  const left = due - done;

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.magenta, size: 420, left: -140, top: -60, stops: [{ o: 0, a: 0.28 }, { o: 70, a: 0 }], variant: "a" },
          { hue: bio.aurora.magenta, size: 320, right: -130, bottom: 120, stops: [{ o: 0, a: 0.14 }, { o: 70, a: 0 }], variant: "b", delayMs: -6000 },
        ]}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Today’s doses"
          label={due === 0 ? "Nothing due" : left === 0 ? "All taken · nice" : `${left} left today`}
          onBack={onBack}
          right={
            due > 0 ? (
              <View style={styles.countRow}>
                <Text style={styles.count}>{done}</Text>
                <Text style={styles.countTotal}>/ {due}</Text>
              </View>
            ) : null
          }
        />

        {day === null ? (
          <View style={styles.centre}>
            {failed ? (
              <LoadFailed what="today's doses" onRetry={() => void load()} />
            ) : (
              <Spinner tint={bio.color.text} />
            )}
          </View>
        ) : slots.length === 0 ? (
          <Text style={styles.empty}>Nothing scheduled today. Add something to your stack first.</Text>
        ) : (
          <View style={styles.spineWrap}>
            <View style={styles.spine} />
            <View style={styles.slots}>
              {slots.map((slot) => (
                <View key={slot.timing} style={styles.slot}>
                  <View style={styles.nodeCol}>
                    <View style={styles.node} />
                  </View>
                  <View style={styles.slotBody}>
                    <View style={styles.slotHead}>
                      <Text style={styles.slotName}>{slot.label.toUpperCase()}</Text>
                      <Text style={styles.slotTime}>{SLOT_TIME[slot.timing]}</Text>
                    </View>
                    <View style={styles.rows}>
                      {slot.doses.map((d) => (
                        <DoseRow key={`${d.id}:${d.timing}`} dose={d} taken={isTaken(d)} onPress={() => void toggle(d)} />
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DoseRow({ dose, taken, onPress }: { dose: ScheduledDose; taken: boolean; onPress: () => void }) {
  // the design's `tickpop`: 0.6 → 1.15 → 1 as the checkmark lands
  const pop = useSharedValue(taken ? 1 : 0);
  const first = useSharedValue(true);

  useEffect(() => {
    if (first.value) {
      first.value = false;
      pop.value = taken ? 1 : 0;
      return;
    }
    pop.value = taken
      ? withSequence(
          withTiming(1.15, { duration: 180, easing: motion.easeOut }),
          withTiming(1, { duration: 120, easing: motion.easeOut }),
        )
      : withTiming(0, { duration: 140, easing: motion.easeOut });
  }, [taken, pop, first]);

  const tickStyle = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: pop.value }] }));

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={[styles.doseName, taken && styles.doneText]} numberOfLines={1}>
        {dose.name}
      </Text>
      <Text style={[styles.doseValue, taken && styles.doneText]}>{dose.dose}</Text>

      <View style={[styles.tick, !taken && styles.tickEmpty]}>
        {taken ? (
          <LinearGradient
            colors={[bio.color.magentaLt, bio.color.magentaDeep]}
            start={{ x: 0.3, y: 0.2 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Animated.View style={tickStyle}>
          <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <Path d="M2.5 6.4 L4.8 8.7 L9.5 3.8" stroke={bio.color.plum} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, flexGrow: 1 },

  countRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  count: {
    fontFamily: fontFamily.dot,
    fontSize: 26,
    letterSpacing: 0.5,
    color: bio.color.text,
    textShadowColor: bio.magentaAlpha(0.4),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
  countTotal: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.alpha(0.4) },

  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontFamily: fontFamily.light, fontSize: 13.5, lineHeight: 21, color: bio.alpha(0.5), textAlign: "center", marginTop: 50 },

  spineWrap: { marginTop: 22, position: "relative" },
  spine: {
    position: "absolute",
    left: 11,
    top: 8,
    bottom: 8,
    width: 0,
    borderLeftWidth: 1.5,
    borderLeftColor: bio.magentaAlpha(0.35),
    borderStyle: "dashed",
  },
  slots: { gap: 20 },
  slot: { flexDirection: "row", gap: 16 },
  nodeCol: { width: 24, alignItems: "center", paddingTop: 2 },
  node: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: bio.color.ink,
    borderWidth: 2,
    borderColor: bio.color.magenta,
    shadowColor: bio.color.magenta,
    shadowOpacity: 0.6,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  slotBody: { flex: 1, minWidth: 0 },
  slotHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 9 },
  slotName: { fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 1.76, color: bio.alpha(0.62) },
  slotTime: { fontFamily: fontFamily.dotBold, fontSize: 12, letterSpacing: 0.7, color: bio.alpha(0.4) },

  rows: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowPressed: { transform: [{ scale: 0.98 }] },
  doseName: { flex: 1, minWidth: 0, fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text },
  doseValue: { fontFamily: fontFamily.dot, fontSize: 15, letterSpacing: 0.3, color: bio.color.text },
  doneText: { color: bio.alpha(0.5) },
  tick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: bio.color.magenta,
    shadowOpacity: 0.7,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  tickEmpty: { borderWidth: 1.5, borderColor: bio.alpha(0.25), shadowOpacity: 0 },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
