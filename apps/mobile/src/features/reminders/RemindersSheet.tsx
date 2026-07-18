/**
 * Reminders sheet — BIOSYNC redesign, the light rose "wind-down moment". A master
 * toggle, a big Doto clock of the nudge time, glass rows for time + quiet hours
 * (native time picker), and a dark quiet-hours summary. Scheduling logic lives in
 * src/lib/reminders / reminderSchedule; this is presentation + wiring.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { AuroraField } from "../../ui/bio/AuroraField";
import { selectionHaptic } from "../../lib/haptics";
import { getReminderPrefs, setReminderPrefs, type ReminderPrefs } from "../../lib/prefs";
import { DEFAULT_REMINDER_PREFS, formatHm, isInQuietHours, parseHm } from "../../lib/reminderSchedule";
import { getReminderPermission, requestReminderPermission, syncReminders } from "../../lib/reminders";
import { bio, fontFamily, motion } from "../../ui/theme";

const INK = bio.color.onRose;
const ink = (a: number): string => `rgba(42,22,38,${a})`;

function hmToDate(hm: string): Date {
  const parts = hm.split(":");
  const d = new Date();
  d.setHours(Number(parts[0] ?? 20), Number(parts[1] ?? 0), 0, 0);
  return d;
}
function dateToHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Field = "time" | "quietStart" | "quietEnd";

export function RemindersSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_REMINDER_PREFS);
  const [picker, setPicker] = useState<Field | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    void getReminderPrefs().then(setPrefs);
  }, []);

  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut }, (f) => {
      if (f) runOnJS(onClose)();
    });
  }, [onClose, scrimP, sheetP]);

  const onSheetLayout = (h: number) => {
    sheetH.value = h;
    if (!opened.current && h > 0) {
      opened.current = true;
      sheetP.value = withTiming(1, { duration: motion.duration.sheetOpen, easing: motion.easeOut });
      scrimP.value = withTiming(1, { duration: motion.duration.sheetScrim, easing: motion.easeOut });
    }
  };
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 560) }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  const apply = useCallback(async (next: ReminderPrefs) => {
    setPrefs(next);
    await setReminderPrefs(next);
    await syncReminders();
  }, []);

  const onToggle = async (next: boolean) => {
    selectionHaptic();
    if (next) {
      const granted = (await getReminderPermission()) || (await requestReminderPermission());
      if (!granted) {
        setDenied(true);
        return;
      }
      setDenied(false);
    }
    await apply({ ...prefs, enabled: next });
  };

  const onPickerChange = (e: DateTimePickerEvent, d?: Date) => {
    const field = picker;
    setPicker(null);
    if (field && e.type === "set" && d) void apply({ ...prefs, [field]: dateToHm(d) });
  };

  const slot = parseHm(prefs.time);
  const conflict = prefs.enabled && slot !== null && isInQuietHours(slot, prefs.quietStart, prefs.quietEnd);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }, sheetStyle]} onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}>
        <AuroraField
          blobs={[{ hue: "214,44,122", size: 430, cx: true, top: 30, stops: [{ o: 0, a: 0.6 }, { o: 40, a: 0.24 }, { o: 74, a: 0 }] }]}
        />
        <View style={styles.grabber} />
        <View style={styles.head}>
          <Text style={styles.title}>Reminders</Text>
          <Switch
            value={prefs.enabled}
            onValueChange={(v) => void onToggle(v)}
            trackColor={{ false: "rgba(42,22,38,0.25)", true: "#B8306E" }}
            thumbColor="#FBEEF5"
          />
        </View>

        <View style={styles.clockWrap}>
          <Text style={styles.clock}>{prefs.time}</Text>
          <Text style={styles.clockLabel}>daily nudge</Text>
        </View>

        {prefs.enabled ? (
          <>
            <Row label="Time" value={formatHm(prefs.time)} onPress={() => setPicker("time")} />
            <Row label="Quiet hours start" value={formatHm(prefs.quietStart)} onPress={() => setPicker("quietStart")} />
            <Row label="Quiet hours end" value={formatHm(prefs.quietEnd)} onPress={() => setPicker("quietEnd")} />
          </>
        ) : null}

        {denied ? (
          <Text style={styles.notice}>Notifications are off for BIOSYNC. Enable them in system settings, then try again.</Text>
        ) : conflict ? (
          <Text style={styles.notice}>That time is inside your quiet hours — no reminder will fire. Pick a time outside the window.</Text>
        ) : null}
      </Animated.View>

      {picker ? <DateTimePicker mode="time" display="clock" value={hmToDate(prefs[picker])} onChange={onPickerChange} /> : null}
    </View>
  );
}

function Row({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: bio.color.rose,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: ink(0.2), alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
  title: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: INK },
  clockWrap: { alignItems: "center", marginTop: 30, marginBottom: 24 },
  clock: { fontFamily: fontFamily.dot, fontSize: 60, letterSpacing: 6, color: "#5A1B3E", textShadowColor: "rgba(214,44,122,0.35)", textShadowRadius: 24, textShadowOffset: { width: 0, height: 0 } },
  clockLabel: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 2, color: ink(0.55), textTransform: "uppercase", marginTop: 4 },
  row: {
    height: 60,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  rowLabel: { fontFamily: fontFamily.semibold, fontSize: 14, color: INK },
  rowValue: { fontFamily: fontFamily.bold, fontSize: 14, color: "#8A2359" },
  notice: { fontFamily: fontFamily.regular, fontSize: 12.5, lineHeight: 18, color: ink(0.6), marginTop: 6 },
});
