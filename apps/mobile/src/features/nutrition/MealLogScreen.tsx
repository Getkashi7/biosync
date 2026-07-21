/**
 * Meal log (design 2C) — today's meals as glass rows with Doto times and P/C/F
 * chips. Tapping a row expands Edit / Delete; delete removes it server-side
 * (scoped to the owner) and refreshes the day so the rings follow immediately.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic, successHaptic } from "../../lib/haptics";
import { clockTime, dateLabel, groupThousands } from "../../lib/format";
import { fetchDay, removeMeal, type Meal, type NutritionDay } from "./nutritionApi";

export function MealLogScreen({
  onBack,
  onChanged,
  refreshKey,
}: {
  onBack: () => void;
  onChanged: () => void;
  refreshKey: number;
}) {
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState<NutritionDay | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDay(await fetchDay());
    } catch {
      setDay(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onDelete = useCallback(
    async (id: string) => {
      pressHaptic();
      setBusy(id);
      try {
        await removeMeal(id);
        successHaptic();
        setOpen(null);
        await load();
        onChanged();
      } finally {
        setBusy(null);
      }
    },
    [load, onChanged],
  );

  const meals = day?.meals ?? [];
  const last = meals.length > 0 ? clockTime(meals[meals.length - 1]!.loggedAt) : null;

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.amber, size: 420, left: -150, top: -110, stops: [{ o: 0, a: 0.26 }, { o: 70, a: 0 }], variant: "a" },
          { hue: bio.aurora.amber, size: 300, right: -120, bottom: 160, stops: [{ o: 0, a: 0.12 }, { o: 70, a: 0 }], variant: "b", delayMs: -6000 },
        ]}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Meal log" label={dateLabel()} onBack={onBack} />

        {day === null ? (
          <View style={styles.centre}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : (
          <>
            <View style={styles.summary}>
              <View style={styles.summaryLeft}>
                <Text style={styles.summaryKcal}>{groupThousands(day.totals.calories)}</Text>
                <Text style={styles.summaryUnit}>kcal logged</Text>
              </View>
              <Text style={styles.summaryMeta}>
                {meals.length} {meals.length === 1 ? "meal" : "meals"}
                {last ? ` · last ${last}` : ""}
              </Text>
            </View>

            {meals.length === 0 ? (
              <Text style={styles.empty}>Nothing logged yet today.</Text>
            ) : (
              <View style={styles.rows}>
                {meals.map((m) => (
                  <MealRow
                    key={m.id}
                    meal={m}
                    open={open === m.id}
                    busy={busy === m.id}
                    onToggle={() => {
                      pressHaptic();
                      setOpen(open === m.id ? null : m.id);
                    }}
                    onDelete={() => void onDelete(m.id)}
                  />
                ))}
              </View>
            )}

            {meals.length > 0 ? <Text style={styles.hint}>Tap a meal to remove it · estimates stay editable</Text> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MealRow({
  meal,
  open,
  busy,
  onToggle,
  onDelete,
}: {
  meal: Meal;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowHead}>
        <Text style={styles.rowName} numberOfLines={1}>
          {meal.description}
        </Text>
        <Text style={styles.rowTime}>{clockTime(meal.loggedAt)}</Text>
      </View>
      <View style={styles.chipRow}>
        <MacroChip letter="P" value={meal.proteinG} />
        <MacroChip letter="C" value={meal.carbsG} />
        <MacroChip letter="F" value={meal.fatG} />
        <Text style={styles.rowKcal}>{groupThousands(meal.calories)} kcal</Text>
      </View>

      {open ? (
        <View style={styles.actions}>
          <Pressable onPress={onDelete} disabled={busy} style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
            <Text style={styles.deleteText}>{busy ? "Removing…" : "Delete"}</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

function MacroChip({ letter, value }: { letter: string; value: number }) {
  return (
    <View style={styles.macroChip}>
      <Text style={styles.macroLetter}>{letter}</Text>
      <Text style={styles.macroValue}>{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, flexGrow: 1 },

  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  summary: {
    borderRadius: bio.radius.card,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingVertical: 15,
    paddingHorizontal: 18,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  summaryLeft: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  summaryKcal: {
    fontFamily: fontFamily.dot,
    fontSize: 27,
    letterSpacing: 1.1,
    color: bio.color.text,
    textShadowColor: bio.amberAlpha(0.35),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  summaryUnit: { fontFamily: fontFamily.semibold, fontSize: 11, color: bio.alpha(0.45) },
  summaryMeta: { fontFamily: fontFamily.regular, fontSize: 11.5, color: bio.alpha(0.45) },

  rows: { gap: 10, marginTop: 14 },
  row: {
    borderRadius: bio.radius.card,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  rowPressed: { transform: [{ scale: 0.98 }] },
  rowHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  rowName: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text },
  rowTime: { fontFamily: fontFamily.dotBold, fontSize: 13, letterSpacing: 0.8, color: bio.alpha(0.65) },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  macroChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  macroLetter: { fontFamily: fontFamily.semibold, fontSize: 9, letterSpacing: 0.72, color: bio.alpha(0.45) },
  macroValue: { fontFamily: fontFamily.dot, fontSize: 12.5, color: bio.color.text },
  rowKcal: { marginLeft: "auto", fontFamily: fontFamily.regular, fontSize: 11.5, color: bio.alpha(0.5) },

  actions: { flexDirection: "row", gap: 10, marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: bio.alpha(0.08) },
  deleteBtn: {
    flex: 1,
    height: 40,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.coralAlpha(0.12),
    borderWidth: 1,
    borderColor: bio.coralAlpha(0.3),
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.coralLt2 },

  empty: { fontFamily: fontFamily.light, fontSize: 13.5, color: bio.alpha(0.5), textAlign: "center", marginTop: 40 },
  hint: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.4), textAlign: "center", marginTop: 14 },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
