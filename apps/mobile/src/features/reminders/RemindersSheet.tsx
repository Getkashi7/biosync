/**
 * Reminders settings sheet (opened from the Profile "Reminders" row). A master
 * toggle plus a daily nudge time and a quiet-hours window, each picked with the
 * native time picker. Every change persists to prefs and re-syncs the scheduled
 * notification. Presentation + wiring only — the scheduling lives in
 * `src/lib/reminders.ts` / `reminderSchedule.ts`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { selectionHaptic } from "../../lib/haptics";
import { getReminderPrefs, setReminderPrefs, type ReminderPrefs } from "../../lib/prefs";
import { DEFAULT_REMINDER_PREFS, formatHm, isInQuietHours, parseHm } from "../../lib/reminderSchedule";
import { getReminderPermission, requestReminderPermission, syncReminders } from "../../lib/reminders";
import { color, motion, radius, size, space, type } from "../../ui/theme";

/** "20:00" → a Date today at that time (for the picker's value). */
function hmToDate(hm: string): Date {
  const parts = hm.split(":");
  const d = new Date();
  d.setHours(Number(parts[0] ?? 20), Number(parts[1] ?? 0), 0, 0);
  return d;
}

/** Date → "HH:MM". */
function dateToHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Field = "time" | "quietStart" | "quietEnd";

export function RemindersSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_REMINDER_PREFS);
  const [picker, setPicker] = useState<Field | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    void getReminderPrefs().then(setPrefs);
  }, []);

  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut }, (finished) => {
      if (finished) runOnJS(onClose)();
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

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 500) }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  /** Persist + reschedule. */
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
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
    }
    await apply({ ...prefs, enabled: next });
  };

  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    const field = picker;
    setPicker(null);
    if (field && event.type === "set" && date) {
      void apply({ ...prefs, [field]: dateToHm(date) });
    }
  };

  const slot = parseHm(prefs.time);
  const quietConflict = prefs.enabled && slot !== null && isInQuietHours(slot, prefs.quietStart, prefs.quietEnd);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, sheetStyle]}
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
      >
        <View style={styles.grabber} />
        <Text style={styles.title}>Reminders</Text>
        <Text style={styles.body}>A daily nudge to check in — skipped on days you’ve already logged.</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Daily reminder</Text>
            <Switch
              value={prefs.enabled}
              onValueChange={(v) => void onToggle(v)}
              trackColor={{ false: color.inset, true: color.orange }}
              thumbColor={color.text}
              ios_backgroundColor={color.inset}
            />
          </View>

          {prefs.enabled ? (
            <>
              <View style={styles.separator} />
              <TimeRow label="Time" value={formatHm(prefs.time)} onPress={() => setPicker("time")} />
              <View style={styles.separator} />
              <TimeRow label="Quiet hours start" value={formatHm(prefs.quietStart)} onPress={() => setPicker("quietStart")} />
              <View style={styles.separator} />
              <TimeRow label="Quiet hours end" value={formatHm(prefs.quietEnd)} onPress={() => setPicker("quietEnd")} />
            </>
          ) : null}
        </View>

        {permissionDenied ? (
          <Text style={styles.notice}>
            Notifications are turned off for Pulse. Enable them in your system settings, then try again.
          </Text>
        ) : quietConflict ? (
          <Text style={styles.notice}>
            That time is inside your quiet hours, so no reminder will fire. Pick a time outside the quiet window.
          </Text>
        ) : null}
      </Animated.View>

      {picker ? (
        <DateTimePicker mode="time" display="clock" value={hmToDate(prefs[picker])} onChange={onPickerChange} />
      ) : null}
    </View>
  );
}

function TimeRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: color.scrim,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderColor: color.hairline,
    paddingTop: size.sheetPadTop,
    paddingHorizontal: size.screenPadX,
  },
  grabber: {
    width: size.grabberW,
    height: size.grabberH,
    borderRadius: size.grabberH,
    backgroundColor: color.border,
    alignSelf: "center",
  },
  title: {
    ...type.sheetTitle,
    color: color.text,
    marginTop: size.sheetTitleGap,
  },
  body: {
    ...type.body,
    color: color.textSecondary,
    marginTop: space.sm,
  },
  card: {
    marginTop: space.lg,
    backgroundColor: color.surfaceAlt,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    overflow: "hidden",
  },
  row: {
    height: size.settingsRow,
    paddingHorizontal: space.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  separator: {
    height: 1,
    backgroundColor: color.hairline,
    marginLeft: space.base,
  },
  rowLabel: {
    ...type.settingsLabel,
    color: color.text,
  },
  rowValue: {
    ...type.settingsLabel,
    color: color.link,
  },
  notice: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: space.md,
  },
});
