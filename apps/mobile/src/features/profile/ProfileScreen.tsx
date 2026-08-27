/**
 * Profile — BIOSYNC redesign. Aurora field + a breathing avatar, identity, and
 * grouped glass settings lists (units · reminders · account). Full-bleed; clears
 * the floating tab bar. Preferences + sign-out/delete wiring unchanged.
 */
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Linking } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { GlassSurface } from "../../ui/bio/GlassSurface";
import { selectionHaptic } from "../../lib/haptics";
import { getReminderPrefs, getUnitPref, setUnitPref, type WeightUnit } from "../../lib/prefs";
import { formatHm } from "../../lib/reminderSchedule";
import { bio, fontFamily } from "../../ui/theme";
import { useAuth } from "../auth/AuthProvider";
import { fetchDashboard } from "../dashboard/dashboardApi";
import { fetchTrainerFeed } from "../mytrainer/myTrainerApi";

function initialsOf(fullName: string | null, email: string): string {
  const words = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  if (words.length === 1 && words[0]!.length > 0) return words[0]![0]!.toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

type Props = {
  onDeleteAccount: () => void;
  onReminders: () => void;
  onCoachPlan: () => void;
  onConsent: () => void;
  /** only present for staff accounts (PT / practitioner) */
  onTrainer?: (() => void) | undefined;
  /** the client's view of what a trainer shared with them */
  onTrainerFeed: () => void;
  /** who this account is connected to, and the way to connect to someone new */
  onCareTeam: () => void;
  /** only present for ADMIN accounts — platform administration, not care */
  onAdmin?: (() => void) | undefined;
  refreshKey: number;
};

export function ProfileScreen({
  onDeleteAccount,
  onReminders,
  onCoachPlan,
  onConsent,
  onTrainer,
  onTrainerFeed,
  onCareTeam,
  onAdmin,
  refreshKey,
}: Props) {
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [reminders, setReminders] = useState("Off");
  const [stats, setStats] = useState<{ streak: number; readiness: number | null } | null>(null);
  // Whether a trainer has shared anything with this account — decides if the
  // "From your trainer" row shows at all, so solo users never see it.
  const [hasTrainerFeed, setHasTrainerFeed] = useState(false);

  useEffect(() => {
    void getUnitPref().then(setUnit);
  }, []);
  useEffect(() => {
    void getReminderPrefs().then((p) => setReminders(p.enabled ? formatHm(p.time) : "Off"));
  }, [refreshKey]);
  useEffect(() => {
    void fetchDashboard()
      .then((d) => setStats({ streak: d.streak, readiness: d.readiness?.score ?? null }))
      .catch(() => {});
  }, [refreshKey]);
  useEffect(() => {
    void fetchTrainerFeed()
      .then((f) => setHasTrainerFeed(f.plans.length > 0 || f.notes.length > 0))
      .catch(() => {});
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
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <Animated.View style={[styles.avatarGlow, glowStyle]} />
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{initialsOf(session?.fullName ?? null, email)}</Text>
            </View>
          </View>
          {session?.fullName ? <Text style={styles.name}>{session.fullName}</Text> : null}
          <Text style={styles.email}>{email}</Text>
          {stats ? (
            <View style={styles.pills}>
              <View style={styles.pill}>
                <Text style={styles.pillNum}>{stats.streak}</Text>
                <Text style={styles.pillLabel}>day streak</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillNum}>{stats.readiness ?? "—"}</Text>
                <Text style={styles.pillLabel}>readiness</Text>
              </View>
            </View>
          ) : null}
        </View>

        <Text style={styles.group}>Coach</Text>
        <GlassSurface style={styles.card} soft>
          <Pressable style={styles.row} onPress={onCoachPlan} accessibilityRole="button">
            <View style={styles.rowVal}>
              <View style={styles.coachDot} />
              <Text style={styles.rowLabel}>Coach plan</Text>
            </View>
            <View style={styles.rowVal}>
              <Text style={styles.coachHint}>Build today’s</Text>
              <Text style={styles.chev}>›</Text>
            </View>
          </Pressable>
        </GlassSurface>

        <Text style={styles.group}>Preferences</Text>
        <GlassSurface style={styles.card} soft>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Units</Text>
            {/* Selected state matters more than the label here: both cells are
                already named by their text, but without it neither announces
                which unit is actually in use. */}
            <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel="Weight units">
              {(["kg", "lb"] as const).map((u) => {
                const on = unit === u;
                return (
                  <Pressable
                    key={u}
                    onPress={() => pickUnit(u)}
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
          <View style={styles.sep} />
          <Pressable style={styles.row} onPress={onReminders} accessibilityRole="button">
            <Text style={styles.rowLabel}>Reminders</Text>
            <View style={styles.rowVal}>
              <Text style={styles.rowValTxt}>{reminders}</Text>
              <Text style={styles.chev}>›</Text>
            </View>
          </Pressable>
        </GlassSurface>

        {/* Care team is unconditional: it's the only route to connecting with a
            trainer in the first place, so hiding it until you have one would
            leave a new user with no way in. The feed row still waits for
            content — there's nothing to read until something is shared. */}
        <Text style={styles.group}>Coaching</Text>
        <GlassSurface style={styles.card} soft>
          <Pressable style={styles.row} onPress={onCareTeam} accessibilityRole="button">
            <Text style={styles.rowLabel}>My care team</Text>
            <View style={styles.rowVal}>
              <Text style={styles.rowValTxt}>Connect or manage</Text>
              <Text style={styles.chev}>›</Text>
            </View>
          </Pressable>
          {hasTrainerFeed ? (
            <>
              <View style={styles.sep} />
              <Pressable style={styles.row} onPress={onTrainerFeed} accessibilityRole="button">
                <Text style={styles.rowLabel}>From your trainer</Text>
                <View style={styles.rowVal}>
                  <Text style={styles.rowValTxt}>Plans & notes</Text>
                  <Text style={styles.chev}>›</Text>
                </View>
              </Pressable>
            </>
          ) : null}
        </GlassSurface>

        {onTrainer ? (
          <>
            <Text style={styles.group}>Staff</Text>
            <GlassSurface style={styles.card} soft>
              <Pressable style={styles.row} onPress={onTrainer} accessibilityRole="button">
                <Text style={styles.rowLabel}>Trainer</Text>
                <View style={styles.rowVal}>
                  <Text style={styles.rowValTxt}>Your roster</Text>
                  <Text style={styles.chev}>›</Text>
                </View>
              </Pressable>
            </GlassSurface>
          </>
        ) : null}

        {onAdmin ? (
          <>
            <Text style={styles.group}>Platform</Text>
            <GlassSurface style={styles.card} soft>
              <Pressable style={styles.row} onPress={onAdmin} accessibilityRole="button">
                <Text style={styles.rowLabel}>Admin</Text>
                <View style={styles.rowVal}>
                  <Text style={styles.rowValTxt}>Staff access</Text>
                  <Text style={styles.chev}>›</Text>
                </View>
              </Pressable>
            </GlassSurface>
          </>
        ) : null}

        <Text style={styles.group}>Privacy</Text>
        <GlassSurface style={styles.card} soft>
          <Pressable style={styles.row} onPress={onConsent} accessibilityRole="button">
            <Text style={styles.rowLabel}>Who sees what</Text>
            <View style={styles.rowVal}>
              <Text style={styles.rowValTxt}>Consent centre</Text>
              <Text style={styles.chev}>›</Text>
            </View>
          </Pressable>
          <View style={styles.sep} />
          <Pressable
            style={styles.row}
            onPress={() => Linking.openURL("https://biosync-api.onrender.com/privacy")}
            accessibilityRole="button"
          >
            <Text style={styles.rowLabel}>Privacy policy</Text>
            <View style={styles.rowVal}>
              <Text style={styles.rowValTxt}>Read more</Text>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  // flexGrow (not flex) so the spacer still pushes the footer down when the
  // content is short, but the list scrolls once it's taller than the screen.
  content: { flexGrow: 1, paddingHorizontal: 24 },
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
  pills: { flexDirection: "row", gap: 10, marginTop: 16 },
  pill: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: bio.color.border2,
  },
  pillNum: { fontFamily: fontFamily.dot, fontSize: 15, letterSpacing: 0.5, color: bio.color.text },
  pillLabel: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.55) },
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
  coachDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: bio.color.teal,
    shadowColor: bio.color.teal,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  coachHint: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.color.tealLt },
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
