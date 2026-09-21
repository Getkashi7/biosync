/**
 * Preferences — units and notifications, pushed from You.
 *
 * N2 folded these two rows into one "Preferences" entry and drew nothing
 * behind it, so this screen is the two existing controls moved, not redesigned:
 * the kg/lb switch and the Notifications row that opens the reminders sheet,
 * in N2's flat-row style with the §6 header.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlatHeader } from "../../ui/bio/FlatHeader";
import { FlatRow, FlatSection } from "../../ui/bio/FlatRow";
import { selectionHaptic } from "../../lib/haptics";
import { getNotificationPrefs, getUnitPref, setUnitPref, type WeightUnit } from "../../lib/prefs";
import { activeNudges, formatHm, parseHm } from "../../lib/reminderSchedule";
import { bio } from "../../ui/theme";

const f = bio.flat;

export function PreferencesScreen({
  onBack,
  onReminders,
  refreshKey,
}: {
  onBack: () => void;
  onReminders: () => void;
  refreshKey: number;
}) {
  const insets = useSafeAreaInsets();
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [reminders, setReminders] = useState("Off");

  useEffect(() => {
    void getUnitPref().then(setUnit);
  }, []);
  useEffect(() => {
    // What will actually fire, not merely what is switched on: a nudge inside
    // quiet hours is silenced, and showing its time would promise a reminder
    // that never arrives.
    void getNotificationPrefs().then((p) => {
      const active = activeNudges(p);
      if (active.length === 0) return setReminders("Off");
      const soonest = active
        .slice()
        .sort((a, b) => (parseHm(a.time ?? "") ?? 0) - (parseHm(b.time ?? "") ?? 0))[0];
      const label = soonest?.time ? formatHm(soonest.time) : "Off";
      setReminders(active.length > 1 ? `${label} +${active.length - 1}` : label);
    });
  }, [refreshKey]);

  const pick = (u: WeightUnit) => {
    if (u === unit) return;
    selectionHaptic();
    setUnit(u);
    void setUnitPref(u);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.head}>
        <FlatHeader title="Preferences" label="You" onBack={onBack} />
      </View>

      <FlatSection>
        <View style={styles.row}>
          <Text style={styles.label}>Units</Text>
          <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel="Weight units">
            {(["kg", "lb"] as const).map((u) => {
              const on = unit === u;
              return (
                <Pressable
                  key={u}
                  onPress={() => pick(u)}
                  style={[styles.segCell, on && styles.segOn]}
                  accessibilityRole="radio"
                  accessibilityLabel={u === "kg" ? "Kilograms" : "Pounds"}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segTxt, on && styles.segTxtOn]}>{u}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <FlatRow label="Notifications" value={reminders} onPress={onReminders} />
      </FlatSection>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  head: { paddingHorizontal: 20, marginBottom: 12 },
  row: { height: f.rowHeight, flexDirection: "row", alignItems: "center" },
  label: { ...f.row, flex: 1, color: bio.color.white },
  seg: {
    flexDirection: "row",
    padding: 3,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.06),
  },
  segCell: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: bio.radius.pill },
  segOn: { backgroundColor: bio.alpha(0.14) },
  segTxt: { ...f.value, color: bio.alpha(0.5) },
  segTxtOn: { color: bio.color.white },
});
