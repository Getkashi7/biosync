/**
 * Consent centre (design 1A) and its first-run state (1B) — the trust layer.
 *
 * One glass row per data category with a 3-way switch: No one · My trainer · My
 * practitioner. "No one" is the default everywhere and is styled as a
 * first-class choice (neutral fill), while sharing lights up violet — so the
 * accent colour literally only appears when data leaves the user. Nothing is
 * pre-consented, and the switch writes through immediately (optimistically, so
 * it feels instant, reverting if the server rejects it).
 */
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

/** The public policy, served by the API so it can change without a build. */
const PRIVACY_URL = "https://biosync-api.onrender.com/privacy";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic, selectionHaptic } from "../../lib/haptics";
import { fetchConsents, setConsent, type ConsentAudience, type ConsentCategory, type ConsentRow } from "./consentApi";

/** plain-language copy per category — mirrored from the shared source of truth */
const COPY: Record<ConsentCategory, { name: string; description: string }> = {
  BIOMETRICS: { name: "Biometrics", description: "Heart rate, HRV, sleep & recovery" },
  JOURNAL: { name: "Journal & check-ins", description: "Moods, notes and daily reflections" },
  DIAGNOSTICS: { name: "Diagnostics & uploads", description: "Lab results and documents you add" },
  PHOTOS: { name: "Progress photos", description: "Photos you take to track change" },
  ACTIVITY: { name: "Activity", description: "Workouts, steps and training load" },
};

const AUDIENCES: { value: ConsentAudience; label: string }[] = [
  { value: "NONE", label: "No one" },
  { value: "TRAINER", label: "My PT" },
  { value: "PRACTITIONER", label: "Biomeds" },
];

export function ConsentCentreScreen({
  onBack,
  onOpenRoles,
  onAccessRecord,
}: {
  onBack: () => void;
  onOpenRoles: () => void;
  /** 9F from the client's side — every time a provider opened these records. */
  onAccessRecord: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<ConsentRow[] | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setRows(await fetchConsents());
    } catch (e) {
      // Leaving `rows` null used to spin forever here — on the one screen where
      // a user is checking who can see their data, that's the worst place to
      // look broken and say nothing.
      setFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const choose = useCallback(
    async (category: ConsentCategory, audience: ConsentAudience) => {
      if (!rows) return;
      const previous = rows;
      selectionHaptic();
      setRows(rows.map((r) => (r.category === category ? { ...r, audience } : r)));
      try {
        await setConsent(category, audience);
      } catch {
        setRows(previous); // put it back rather than imply a share that didn't save
      }
    },
    [rows],
  );

  const sharingAnything = rows?.some((r) => r.audience !== "NONE") ?? false;

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.violet, size: 460, cx: true, top: -70, stops: [{ o: 0, a: 0.32 }, { o: 46, a: 0.1 }, { o: 72, a: 0 }], variant: "a" },
          { hue: bio.aurora.blue, size: 300, right: -120, bottom: 150, stops: [{ o: 0, a: 0.12 }, { o: 70, a: 0 }], variant: "b", delayMs: -5000 },
        ]}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />
        }
      >
        <ScreenHeader title="Who sees what" label="Consent centre" onBack={onBack} right={<ShieldMark />} />

        <Text style={styles.intro}>
          You choose who sees each kind of data. Nothing leaves you until you say so —{" "}
          <Text style={styles.introStrong}>No one</Text> is always the default.
        </Text>

        {rows === null ? (
          <View style={styles.centre}>
            {failed ? (
              <LoadFailed what="your sharing settings" kind={failed ?? "offline"} onRetry={() => void load()} />
            ) : (
              <Spinner tint={bio.color.text} />
            )}
          </View>
        ) : (
          <>
            {!sharingAnything ? <FirstRunNote /> : null}

            <View style={styles.rows}>
              {rows.map((row) => (
                <View key={row.category} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={[styles.statusDot, row.audience !== "NONE" && styles.statusDotOn]} />
                    <View style={styles.cardText}>
                      <Text style={styles.cardName}>{COPY[row.category].name}</Text>
                      <Text style={styles.cardDesc}>{COPY[row.category].description}</Text>
                    </View>
                  </View>

                  <View style={styles.switch}>
                    {AUDIENCES.map((a) => {
                      const active = row.audience === a.value;
                      const sharing = active && a.value !== "NONE";
                      return (
                        <Pressable
                          key={a.value}
                          onPress={() => void choose(row.category, a.value)}
                          style={({ pressed }) => [
                            styles.cell,
                            active && !sharing && styles.cellPrivate,
                            pressed && styles.cellPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          {sharing ? (
                            <LinearGradient
                              colors={[bio.color.violet, bio.color.violetDeep]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                          ) : null}
                          <Text
                            style={[
                              styles.cellText,
                              active && !sharing && styles.cellTextPrivate,
                              sharing && styles.cellTextSharing,
                            ]}
                            numberOfLines={1}
                          >
                            {a.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              onPress={() => {
                pressHaptic();
                onOpenRoles();
              }}
              style={({ pressed }) => [styles.rolesLink, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.rolesLinkText}>What each role sees</Text>
              <Svg width={8} height={8} viewBox="0 0 9 9" fill="none">
                <Path d="M2 1 L6 4.5 L2 8" stroke={bio.color.violetLt} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>

            {/* The other half of a consent control: having said who may look,
                the person can see who did. */}
            <Pressable
              onPress={() => {
                pressHaptic();
                onAccessRecord();
              }}
              style={({ pressed }) => [styles.rolesLink, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.rolesLinkText}>Who has looked</Text>
              <Svg width={8} height={8} viewBox="0 0 9 9" fill="none">
                <Path d="M2 1 L6 4.5 L2 8" stroke={bio.color.violetLt} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>

            {/* Folded in from You by N2: the policy belongs next to the
                controls it describes, not in a settings list. */}
            <Pressable
              onPress={() => {
                pressHaptic();
                void Linking.openURL(PRIVACY_URL);
              }}
              style={({ pressed }) => [styles.rolesLink, pressed && styles.pressed]}
              accessibilityRole="link"
            >
              <Text style={styles.rolesLinkText}>Privacy policy</Text>
              <Svg width={8} height={8} viewBox="0 0 9 9" fill="none">
                <Path d="M2 1 L6 4.5 L2 8" stroke={bio.color.violetLt} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** the design's dotted eye/shield mark, breathing gently */
function ShieldMark() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.6, 1]) }));

  return (
    <Animated.View style={[styles.shield, style]}>
      <Svg width={34} height={38} viewBox="0 0 34 38" fill="none">
        <Path
          d="M17 1.5 L32 6.5 V18 C32 27 25 33.5 17 36.5 C9 33.5 2 27 2 18 V6.5 Z"
          stroke={bio.color.violetLt}
          strokeOpacity={0.7}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <Circle cx={17} cy={16} r={2.6} fill={bio.color.violetLt} />
        <Path d="M17 19 V25" stroke={bio.color.violetLt} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function FirstRunNote() {
  return (
    <View style={styles.firstRun}>
      <View style={styles.firstRunDot} />
      <Text style={styles.firstRunText}>
        Nothing is shared yet. Sharing is optional and off by default — turn on only what you want.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 22, flexGrow: 1 },

  shield: { width: 34, height: 38, alignItems: "center", justifyContent: "center" },

  intro: { fontFamily: fontFamily.light, fontSize: 12.5, lineHeight: 19, color: bio.alpha(0.62), marginTop: 14 },
  introStrong: { fontFamily: fontFamily.semibold, color: bio.alpha(0.85) },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  firstRun: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
    borderRadius: bio.radius.sm,
    backgroundColor: bio.violetAlpha(0.09),
    borderWidth: 1,
    borderColor: bio.violetAlpha(0.24),
    marginTop: 16,
  },
  firstRunDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: bio.color.violetLt,
    marginTop: 4,
  },
  firstRunText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 11.5, lineHeight: 17, color: bio.alpha(0.72) },

  rows: { gap: 8, marginTop: 18 },
  card: {
    borderRadius: 20,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: bio.alpha(0.25) },
  statusDotOn: {
    backgroundColor: bio.color.violet,
    shadowColor: bio.color.violet,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  cardText: { flex: 1, minWidth: 0 },
  cardName: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text },
  cardDesc: { fontFamily: fontFamily.light, fontSize: 11, color: bio.alpha(0.5), marginTop: 2 },

  switch: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: 13,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    marginTop: 10,
  },
  cell: {
    flex: 1,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cellPrivate: { backgroundColor: bio.alpha(0.14) },
  cellPressed: { transform: [{ scale: 0.97 }] },
  cellText: { fontFamily: fontFamily.bold, fontSize: 10.5, color: bio.alpha(0.5) },
  cellTextPrivate: { color: bio.color.text },
  cellTextSharing: { color: bio.color.onViolet },

  rolesLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.violetAlpha(0.08),
    borderWidth: 1,
    borderColor: bio.violetAlpha(0.3),
  },
  rolesLinkText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.color.violetLt },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
