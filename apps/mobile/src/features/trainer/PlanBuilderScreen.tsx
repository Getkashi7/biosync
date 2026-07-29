/**
 * Plan builder (design 3A) — assign a week's training to a client.
 *
 * Two deliberate departures from the prototype, both for the sake of it
 * actually working on a phone:
 *  · The prototype reorders by pointer-drag. Native drag-reorder needs a gesture
 *    library we don't carry, and a half-working drag is worse than none — so the
 *    handle column is a pair of move up/down controls instead. Same position,
 *    same weight, reliable.
 *  · Its week stepper counts training-block weeks (1–12). Plans are keyed by real
 *    ISO week server-side (one plan per client per calendar week), so the stepper
 *    moves calendar weeks and shows that week's number.
 *
 * The exercise library is static reference data, not user data.
 */
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic, selectionHaptic, successHaptic } from "../../lib/haptics";
import { initials, isoWeekOf, weekNumber } from "../../lib/format";
import { savePlan } from "./trainerApi";
import { ScopeLine } from "./TrainerRosterScreen";

type LibraryExercise = { id: string; name: string; group: string };
type PlanRow = LibraryExercise & { sets: number; reps: number };

const LIBRARY: LibraryExercise[] = [
  { id: "squat", name: "Back squat", group: "Legs" },
  { id: "rdl", name: "Romanian deadlift", group: "Hamstrings" },
  { id: "lunge", name: "Walking lunge", group: "Legs" },
  { id: "bench", name: "Bench press", group: "Chest" },
  { id: "pullup", name: "Pull-up", group: "Back" },
  { id: "ohp", name: "Overhead press", group: "Shoulders" },
  { id: "row", name: "Seated row", group: "Back" },
  { id: "hipthrust", name: "Hip thrust", group: "Glutes" },
  { id: "plank", name: "Plank", group: "Core" },
  { id: "kbswing", name: "Kettlebell swing", group: "Full body" },
];

const SETS_MIN = 1;
const SETS_MAX = 12;
const REPS_MIN = 1;
const REPS_MAX = 30;
/** how far ahead/behind the current week a plan can be assigned */
const WEEK_RANGE = 8;


/** the ISO week `offset` weeks from today */
function weekKeyFor(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset * 7);
  return isoWeekOf(d);
}

export function PlanBuilderScreen({
  clientId,
  clientName,
  onBack,
  onSaved,
}: {
  clientId: string;
  clientName: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekKey = useMemo(() => weekKeyFor(weekOffset), [weekOffset]);
  const inPlan = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  const addExercise = (ex: LibraryExercise) => {
    if (inPlan.has(ex.id)) return;
    selectionHaptic();
    setRows((prev) => [...prev, { ...ex, sets: 3, reps: 10 }]);
  };

  const removeRow = (id: string) => {
    selectionHaptic();
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const bump = (id: string, field: "sets" | "reps", delta: number) => {
    selectionHaptic();
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const min = field === "sets" ? SETS_MIN : REPS_MIN;
        const max = field === "sets" ? SETS_MAX : REPS_MAX;
        return { ...r, [field]: Math.max(min, Math.min(max, r[field] + delta)) };
      }),
    );
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    selectionHaptic();
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
  };

  const changeWeek = (delta: number) => {
    const next = weekOffset + delta;
    if (next < -WEEK_RANGE || next > WEEK_RANGE) return;
    selectionHaptic();
    setWeekOffset(next);
  };

  const save = useCallback(async () => {
    if (rows.length === 0 || saving) return;
    pressHaptic();
    setSaving(true);
    setError(null);
    try {
      await savePlan(
        clientId,
        weekKey,
        `Week ${weekNumber(weekKey)}`,
        rows.map((r) => ({ name: r.name, sets: r.sets, reps: r.reps })),
      );
      successHaptic();
      onSaved();
    } catch {
      setError("Couldn’t assign that plan — try again.");
      setSaving(false);
    }
  }, [rows, saving, clientId, weekKey, onSaved]);

  const canSave = rows.length > 0 && !saving;

  return (
    <View style={styles.root}>
      <StaticBloom />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              pressHaptic();
              onBack();
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Svg width={10} height={10} viewBox="0 0 10 10" fill="none">
              <Path d="M6.5 1 L2.5 5 L6.5 9" stroke={bio.alpha(0.8)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title}>New plan</Text>
            <Text style={styles.subtitle}>PLAN BUILDER</Text>
          </View>
        </View>

        <ScopeLine />

        <View style={styles.assignCard}>
          <View style={styles.assignRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(clientName)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.miniLabel}>ASSIGN TO</Text>
              <Text style={styles.assignName} numberOfLines={1}>
                {clientName}
              </Text>
            </View>
          </View>

          <View style={styles.assignDivider} />

          <View style={styles.assignRow}>
            <View style={styles.flex}>
              <Text style={styles.miniLabel}>TRAINING WEEK</Text>
              <Text style={styles.assignName}>
                {weekOffset === 0 ? "This week" : weekOffset > 0 ? `In ${weekOffset} wk` : `${-weekOffset} wk ago`}
              </Text>
            </View>
            <View style={styles.stepper}>
              <StepButton kind="minus" onPress={() => changeWeek(-1)} />
              <View style={styles.weekValue}>
                <Text style={styles.weekPrefix}>WK </Text>
                <Text style={styles.weekNumber}>{weekNumber(weekKey)}</Text>
              </View>
              <StepButton kind="plus" onPress={() => changeWeek(1)} />
            </View>
          </View>
        </View>

        <View style={styles.planHead}>
          <Text style={styles.sectionLabel}>PLAN</Text>
          <Text style={styles.planCount}>{rows.length}</Text>
        </View>

        {rows.length === 0 ? (
          <View style={styles.emptyPlan}>
            <Text style={styles.emptyPlanText}>No exercises yet — add from the library below.</Text>
          </View>
        ) : (
          <View style={styles.planRows}>
            {rows.map((r, i) => (
              <View key={r.id} style={styles.planRow}>
                <View style={styles.planRowTop}>
                  <View style={styles.moveCol}>
                    <Pressable
                      onPress={() => move(i, -1)}
                      disabled={i === 0}
                      style={({ pressed }) => [styles.moveBtn, i === 0 && styles.moveDim, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Move up"
                      accessibilityState={{ disabled: i === 0 }}
                    >
                      <Svg width={11} height={7} viewBox="0 0 11 7" fill="none">
                        <Path d="M1 6 L5.5 1.5 L10 6" stroke={bio.alpha(0.45)} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </Pressable>
                    <Pressable
                      onPress={() => move(i, 1)}
                      disabled={i === rows.length - 1}
                      style={({ pressed }) => [
                        styles.moveBtn,
                        i === rows.length - 1 && styles.moveDim,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Move down"
                      accessibilityState={{ disabled: i === rows.length - 1 }}
                    >
                      <Svg width={11} height={7} viewBox="0 0 11 7" fill="none">
                        <Path d="M1 1.5 L5.5 6 L10 1.5" stroke={bio.alpha(0.45)} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </Pressable>
                  </View>

                  <View style={styles.flex}>
                    <Text style={styles.exerciseName}>{r.name}</Text>
                    <Text style={styles.exerciseGroup}>{r.group}</Text>
                  </View>

                  <Pressable
                    onPress={() => removeRow(r.id)}
                    style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${r.name}`}
                  >
                    <Svg width={11} height={11} viewBox="0 0 11 11" fill="none">
                      <Path d="M1 1 L10 10 M10 1 L1 10" stroke={bio.alpha(0.4)} strokeWidth={1.7} strokeLinecap="round" />
                    </Svg>
                  </Pressable>
                </View>

                <View style={styles.counters}>
                  <Counter
                    label="Sets"
                    value={r.sets}
                    onDec={() => bump(r.id, "sets", -1)}
                    onInc={() => bump(r.id, "sets", 1)}
                  />
                  <Counter
                    label="Reps"
                    value={r.reps}
                    onDec={() => bump(r.id, "reps", -1)}
                    onInc={() => bump(r.id, "reps", 1)}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.sectionLabel, styles.libraryLabel]}>ADD FROM LIBRARY</Text>
        <View style={styles.library}>
          {LIBRARY.map((ex) => {
            const added = inPlan.has(ex.id);
            return (
              <Pressable
                key={ex.id}
                onPress={() => addExercise(ex)}
                disabled={added}
                style={({ pressed }) => [styles.libRow, pressed && !added && styles.libRowPressed]}
              >
                <View style={styles.flex}>
                  <Text style={[styles.libName, added && styles.libNameAdded]}>{ex.name}</Text>
                  <Text style={styles.libGroup}>{ex.group}</Text>
                </View>
                {added ? (
                  <View style={styles.addedTag}>
                    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                      <Path d="M2 6.4 L4.8 9 L10 3.2" stroke={bio.color.teal} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                    <Text style={styles.addedText}>Added</Text>
                  </View>
                ) : (
                  <View style={styles.addBtn}>
                    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                      <Path d="M6 1 V11 M1 6 H11" stroke={bio.color.teal} strokeWidth={2} strokeLinecap="round" />
                    </Svg>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.ctaWrap, { bottom: insets.bottom + 22 }]}>
        <Pressable
          onPress={() => void save()}
          disabled={!canSave}
          style={({ pressed }) => [styles.cta, !canSave && styles.ctaDim, pressed && styles.ctaPressed]}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={[bio.color.teal, bio.color.tealDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaFill}
          >
            <Text style={styles.ctaText}>
              {saving ? "Assigning…" : `Assign plan · Week ${weekNumber(weekKey)}`}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

function StepButton({ kind, onPress }: { kind: "plus" | "minus"; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.stepBtn, pressed && styles.stepPressed]}>
      <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
        {kind === "plus" ? (
          <Path d="M6 0 V12 M0 6 H12" stroke={bio.color.teal} strokeWidth={2} strokeLinecap="round" />
        ) : (
          <Path d="M0 6 H12" stroke={bio.alpha(0.7)} strokeWidth={2} strokeLinecap="round" />
        )}
      </Svg>
    </Pressable>
  );
}

function Counter({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.counter}>
      <StepButton kind="minus" onPress={onDec} />
      <View style={styles.counterMid}>
        <Text style={styles.counterLabel}>{label.toUpperCase()}</Text>
        <Text style={styles.counterValue}>{value}</Text>
      </View>
      <StepButton kind="plus" onPress={onInc} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, flexGrow: 1 },


  header: { flexDirection: "row", alignItems: "center", gap: 13 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.06),
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fontFamily.bold, fontSize: 21, letterSpacing: -0.21, color: bio.color.text },
  subtitle: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 1.47, color: bio.alpha(0.45), marginTop: 3 },

  assignCard: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    overflow: "hidden",
  },
  assignRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  assignDivider: { height: 1, backgroundColor: bio.alpha(0.07), marginHorizontal: 14 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.07),
    borderWidth: 1,
    borderColor: bio.alpha(0.13),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.alpha(0.85) },
  miniLabel: { fontFamily: fontFamily.bold, fontSize: 9, letterSpacing: 1.26, color: bio.alpha(0.4) },
  assignName: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.text, marginTop: 2 },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 38,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  stepBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  stepPressed: { transform: [{ scale: 0.86 }] },
  weekValue: { minWidth: 46, flexDirection: "row", alignItems: "baseline", justifyContent: "center" },
  weekPrefix: { fontFamily: fontFamily.bold, fontSize: 8, letterSpacing: 0.8, color: bio.alpha(0.4) },
  weekNumber: { fontFamily: fontFamily.dot, fontSize: 17, color: bio.color.text },

  planHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 2 },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 24,
    marginBottom: 10,
  },
  planCount: { fontFamily: fontFamily.dotBold, fontSize: 13, color: bio.alpha(0.5) },

  emptyPlan: {
    alignItems: "center",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: bio.alpha(0.12),
  },
  emptyPlanText: { fontFamily: fontFamily.light, fontSize: 12.5, color: bio.alpha(0.4), textAlign: "center" },

  planRows: { gap: 9 },
  planRow: {
    borderRadius: 16,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    padding: 12,
  },
  planRowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  moveCol: { width: 22, gap: 3 },
  moveBtn: { height: 15, alignItems: "center", justifyContent: "center" },
  moveDim: { opacity: 0.25 },
  exerciseName: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.text },
  exerciseGroup: { fontFamily: fontFamily.light, fontSize: 11, color: bio.alpha(0.45), marginTop: 1 },
  removeBtn: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  counters: { flexDirection: "row", gap: 10, marginTop: 10 },
  counter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 40,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  counterMid: { alignItems: "center" },
  counterLabel: { fontFamily: fontFamily.bold, fontSize: 8, letterSpacing: 0.96, color: bio.alpha(0.4) },
  counterValue: { fontFamily: fontFamily.dot, fontSize: 17, lineHeight: 20, color: bio.color.text },

  libraryLabel: { paddingHorizontal: 2 },
  library: { gap: 8 },
  libRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.alpha(0.09),
  },
  libRowPressed: { transform: [{ scale: 0.99 }], opacity: 0.85 },
  libName: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text },
  libNameAdded: { color: bio.alpha(0.5) },
  libGroup: { fontFamily: fontFamily.light, fontSize: 11, color: bio.alpha(0.4), marginTop: 1 },
  addBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: bio.tealAlpha(0.12),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.35),
    alignItems: "center",
    justifyContent: "center",
  },
  addedTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  addedText: { fontFamily: fontFamily.semibold, fontSize: 11, color: bio.color.teal },

  error: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.alpha(0.6), marginTop: 14 },

  ctaWrap: { position: "absolute", left: 20, right: 20 },
  cta: { height: 54, borderRadius: 16, overflow: "hidden" },
  ctaFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  ctaDim: { opacity: 0.45 },
  ctaPressed: { transform: [{ scale: 0.985 }] },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 15, color: bio.color.onTeal },

  pressed: { opacity: 0.85, transform: [{ scale: 0.9 }] },
});
