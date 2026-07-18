/**
 * Profile — BIOSYNC redesign. Aurora field + a breathing avatar, identity, and
 * grouped glass settings lists (units · reminders · account). Full-bleed; clears
 * the floating tab bar. Preferences + sign-out/delete wiring unchanged.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { GlassSurface } from "../../ui/bio/GlassSurface";
import { selectionHaptic } from "../../lib/haptics";
import { getReminderPrefs, getUnitPref, setUnitPref, type WeightUnit } from "../../lib/prefs";
import { formatHm } from "../../lib/reminderSchedule";
import { bio, fontFamily } from "../../ui/theme";
import { useAuth } from "../auth/AuthProvider";

function initialsOf(fullName: string | null, email: string): string {
  const words = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  if (words.length === 1 && words[0]!.length > 0) return words[0]![0]!.toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

type Props = { onDeleteAccount: () => void; onReminders: () => void; refreshKey: number };

export function ProfileScreen({ onDeleteAccount, onReminders, refreshKey }: Props) {
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [reminders, setReminders] = useState("Off");

  useEffect(() => {
    void getUnitPref().then(setUnit);
  }, []);
  useEffect(() => {
    void getReminderPrefs().then((p) => setReminders(p.enabled ? formatHm(p.time) : "Off"));
  }, [refreshKey]);

  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.5 + glow.value * 0.45, transform: [{ scale: 1 + glow.value * 0.06 }] }));

  const email = session?.email ?? "";
  const pickUnit = (u: WeightUnit) => {
    if (u === unit) return;
    selectionHaptic();
    setUnit(u);
    void setUnitPref(u);
  };

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[{ hue: bio.aurora.teal, size: 380, cx: true, top: -140, stops: [{ o: 0, a: 0.26 }, { o: 48, a: 0.12 }, { o: 72, a: 0 }] }]}
      />
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <Animated.View style={[styles.avatarGlow, glowStyle]} />
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{initialsOf(session?.fullName ?? null, email)}</Text>
            </View>
          </View>
          {session?.fullName ? <Text style={styles.name}>{session.fullName}</Text> : null}
          <Text style={styles.email}>{email}</Text>
        </View>

        <Text style={styles.group}>Preferences</Text>
        <GlassSurface style={styles.card} soft>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Units</Text>
            <View style={styles.seg}>
              {(["kg", "lb"] as const).map((u) => {
                const on = unit === u;
                return (
                  <Pressable key={u} onPress={() => pickUnit(u)} style={[styles.segCell, on && styles.segOn]} accessibilityRole="button">
                    <Text style={[styles.segTxt, on && styles.segTxtOn]}>{u}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.sep} />
          <Pressable style={styles.row} onPress={onReminders} accessibilityRole="button">
            <Text style={styles.rowLabel}>Reminders</Text>
            <View style={styles.rowVal}>
              <Text style={styles.rowValTxt}>{reminders}</Text>
              <Text style={styles.chev}>›</Text>
            </View>
          </Pressable>
        </GlassSurface>

        <Text style={styles.group}>Account</Text>
        <GlassSurface style={styles.card} soft>
          <Pressable style={styles.row} onPress={() => void signOut()} accessibilityRole="button">
            <Text style={styles.rowLabel}>Sign out</Text>
          </Pressable>
          <View style={styles.sep} />
          <Pressable style={styles.row} onPress={onDeleteAccount} accessibilityRole="button">
            <Text style={[styles.rowLabel, { color: bio.color.coral }]}>Delete account</Text>
          </Pressable>
        </GlassSurface>

        <View style={styles.flex} />
        <Text style={styles.version}>BIOSYNC · your body, in tune</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  content: { flex: 1, paddingHorizontal: 24, paddingBottom: 120 },
  identity: { alignItems: "center" },
  avatarWrap: { width: 84, height: 84, alignItems: "center", justifyContent: "center" },
  avatarGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(94,212,192,0.28)",
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#211E33",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { fontFamily: fontFamily.bold, fontSize: 30, color: bio.color.text },
  name: { fontFamily: fontFamily.bold, fontSize: 21, color: bio.color.text, marginTop: 14 },
  email: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.5), marginTop: 4 },
  group: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.4),
    textTransform: "uppercase",
    marginTop: 30,
    marginBottom: 10,
  },
  card: { overflow: "hidden" },
  row: { height: 54, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { fontFamily: fontFamily.medium, fontSize: 15, color: bio.color.text },
  rowVal: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowValTxt: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.alpha(0.5) },
  chev: { fontFamily: fontFamily.regular, fontSize: 18, color: bio.alpha(0.35) },
  sep: { height: 1, backgroundColor: bio.color.hairline, marginLeft: 18 },
  seg: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3, gap: 3 },
  segCell: { width: 38, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  segOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  segTxt: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.5) },
  segTxtOn: { color: bio.color.text },
  flex: { flex: 1 },
  version: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.32), textAlign: "center" },
});
