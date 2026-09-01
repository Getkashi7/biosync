/**
 * Notification settings (§12) — BIOSYNC redesign, the light rose "wind-down
 * moment". A big Doto clock of the next nudge, a grouped glass list of nudge
 * types (each a toggle + its time), and the quiet-hours window that governs
 * them all. Scheduling logic lives in src/lib/reminders / reminderSchedule;
 * this is presentation + wiring.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { AuroraField } from "../../ui/bio/AuroraField";
import { selectionHaptic } from "../../lib/haptics";
import {
  NUDGE_COPY,
  NUDGE_TYPES,
  activeNudges,
  defaultNotificationPrefs,
  formatHm,
  getNudge,
  isNudgeSilenced,
  parseHm,
  type NotificationPrefs,
  type NudgeType,
} from "../../lib/reminderSchedule";
import { getReminderPermission, requestReminderPermission, syncReminders } from "../../lib/reminders";
import { fetchNotificationPrefs, saveNotificationPrefs } from "./notificationsApi";
import { bio, fontFamily, motion } from "../../ui/theme";

const INK = bio.color.onRose;
const ACCENT = "#B8306E";
const ACCENT_DEEP = "#8A2359";
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

/** Which time the picker is editing: a nudge's time, or a quiet-hours edge. */
type Picker = { kind: "nudge"; type: NudgeType } | { kind: "quiet"; edge: "quietStart" | "quietEnd" };

/** The soonest nudge time still ahead today, else the earliest tomorrow. */
function nextClock(prefs: NotificationPrefs): string | null {
  const active = activeNudges(prefs);
  if (active.length === 0) return null;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const slots = active
    .map((n) => ({ time: n.time as string, slot: parseHm(n.time as string) ?? 0 }))
    .sort((a, b) => a.slot - b.slot);
  return (slots.find((s) => s.slot > mins) ?? slots[0])?.time ?? null;
}

export function RemindersSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultNotificationPrefs());
  const [picker, setPicker] = useState<Picker | null>(null);
  const [denied, setDenied] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    void fetchNotificationPrefs().then(({ prefs: p, synced }) => {
      setPrefs(p);
      setOffline(!synced);
    });
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

  /** Apply locally + schedule immediately, then mirror to the server. */
  const apply = useCallback(async (next: NotificationPrefs) => {
    setPrefs(next);
    const synced = await saveNotificationPrefs(next);
    setOffline(!synced);
    await syncReminders();
  }, []);

  const setNudge = useCallback(
    async (type: NudgeType, patch: { enabled?: boolean; time?: string }) => {
      const next: NotificationPrefs = {
        ...prefs,
        nudges: prefs.nudges.map((n) => (n.type === type ? { ...n, ...patch } : n)),
      };
      await apply(next);
    },
    [apply, prefs],
  );

  const onToggle = async (type: NudgeType, on: boolean) => {
    selectionHaptic();
    if (on) {
      const granted = (await getReminderPermission()) || (await requestReminderPermission());
      if (!granted) {
        setDenied(true);
        return;
      }
      setDenied(false);
    }
    await setNudge(type, { enabled: on });
  };

  const onPickerChange = (e: DateTimePickerEvent, d?: Date) => {
    const active = picker;
    setPicker(null);
    if (!active || e.type !== "set" || !d) return;
    const hm = dateToHm(d);
    if (active.kind === "nudge") void setNudge(active.type, { time: hm });
    else void apply({ ...prefs, [active.edge]: hm });
  };

  const clock = nextClock(prefs);
  const silenced = NUDGE_TYPES.filter((t) => isNudgeSilenced(prefs, t));
  const pickerValue =
    picker === null
      ? "20:00"
      : picker.kind === "quiet"
        ? prefs[picker.edge]
        : (getNudge(prefs, picker.type).time ?? "20:00");

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 24 }, sheetStyle]}
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
      >
        <AuroraField
          blobs={[{ hue: "214,44,122", size: 430, cx: true, top: 30, stops: [{ o: 0, a: 0.6 }, { o: 40, a: 0.24 }, { o: 74, a: 0 }] }]}
        />
        <View style={styles.grabber} />
        <View style={styles.head}>
          <Text style={styles.title}>Notifications</Text>
        </View>

        <View style={styles.clockWrap}>
          <Text style={styles.clock}>{clock ?? "--:--"}</Text>
          <Text style={styles.clockLabel}>{clock ? "next nudge" : "nothing scheduled"}</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          showsVerticalScrollIndicator={false}
        >
          {NUDGE_TYPES.map((type) => {
            const nudge = getNudge(prefs, type);
            const copy = NUDGE_COPY[type];
            return (
              <View key={type} style={styles.group}>
                <View style={styles.groupHead}>
                  <View style={styles.groupText}>
                    <Text style={styles.groupTitle}>{copy.label}</Text>
                    <Text style={styles.groupCaption}>{copy.caption}</Text>
                  </View>
                  <Switch
                    value={nudge.enabled}
                    onValueChange={(v) => void onToggle(type, v)}
                    trackColor={{ false: ink(0.25), true: ACCENT }}
                    thumbColor="#FBEEF5"
                    accessibilityLabel={copy.label}
                  />
                </View>
                {nudge.enabled ? (
                  <Row
                    label="Time"
                    value={formatHm(nudge.time ?? "20:00")}
                    onPress={() => setPicker({ kind: "nudge", type })}
                  />
                ) : null}
              </View>
            );
          })}

          <Text style={styles.sectionLabel}>Quiet hours</Text>
          <Text style={styles.groupCaption}>Nothing fires inside this window.</Text>
          <View style={styles.quietRows}>
            <Row
              label="Start"
              value={formatHm(prefs.quietStart)}
              onPress={() => setPicker({ kind: "quiet", edge: "quietStart" })}
            />
            <Row
              label="End"
              value={formatHm(prefs.quietEnd)}
              onPress={() => setPicker({ kind: "quiet", edge: "quietEnd" })}
            />
          </View>

          {denied ? (
            <Text style={styles.notice}>
              Notifications are off for BIOSYNC. Enable them in system settings, then try again.
            </Text>
          ) : null}
          {silenced.length > 0 ? (
            <Text style={styles.notice}>
              {silenced.length === 1
                ? `${NUDGE_COPY[silenced[0] as NudgeType].label} is set inside your quiet hours, so it won't fire. Move its time or the window.`
                : `${silenced.length} nudges are set inside your quiet hours, so they won't fire. Move their times or the window.`}
            </Text>
          ) : null}
          {offline ? (
            <Text style={styles.notice}>
              Saved on this phone. We couldn&apos;t reach the server, so these won&apos;t follow you to a new device yet.
            </Text>
          ) : null}
        </ScrollView>
      </Animated.View>

      {picker ? (
        <DateTimePicker mode="time" display="clock" value={hmToDate(pickerValue)} onChange={onPickerChange} />
      ) : null}
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
    maxHeight: "92%",
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
  clockWrap: { alignItems: "center", marginTop: 22, marginBottom: 18 },
  clock: {
    fontFamily: fontFamily.dot,
    fontSize: 60,
    letterSpacing: 6,
    color: "#5A1B3E",
    textShadowColor: "rgba(214,44,122,0.35)",
    textShadowRadius: 24,
    textShadowOffset: { width: 0, height: 0 },
  },
  clockLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 2,
    color: ink(0.55),
    textTransform: "uppercase",
    marginTop: 4,
  },
  scroll: { flexGrow: 0 },
  scrollBody: { paddingBottom: 8 },
  group: { marginBottom: 18 },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  groupText: { flex: 1, paddingRight: 12 },
  groupTitle: { fontFamily: fontFamily.semibold, fontSize: 15, color: INK },
  groupCaption: { fontFamily: fontFamily.regular, fontSize: 12.5, lineHeight: 18, color: ink(0.55), marginTop: 2 },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: INK,
    marginTop: 4,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: ink(0.12),
  },
  quietRows: { marginTop: 10 },
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
    marginTop: 10,
  },
  rowLabel: { fontFamily: fontFamily.semibold, fontSize: 14, color: INK },
  rowValue: { fontFamily: fontFamily.bold, fontSize: 14, color: ACCENT_DEEP },
  notice: { fontFamily: fontFamily.regular, fontSize: 12.5, lineHeight: 18, color: ink(0.6), marginTop: 14 },
});
