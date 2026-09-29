/**
 * What each role sees (design 2A) — the plain-words explainer behind the consent
 * centre. Two glass cards, each with a "Can see" list (accent check) and a
 * "Never sees" list (barred grey dot). No red, no warning language: this is a
 * reassurance screen, not a scare screen.
 *
 * The copy states hard limits that hold regardless of consent — a trainer never
 * sees health records even if the user shares everything — so it must stay in
 * step with what the API actually enforces when staff access lands.
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { bio, fontFamily } from "../../ui/theme";

type RoleInfo = {
  title: string;
  blurb: string;
  /** the card's accent — violet for the trainer, blue for the practitioner */
  hue: string;
  can: string[];
  never: string[];
};

const TRAINER: RoleInfo = {
  title: "Your PT",
  blurb: "Fitness & activity only — never your health records.",
  hue: bio.color.violetLt,
  can: ["Activity — workouts, steps & load", "Progress photos you choose to share", "Check-in streaks (not the notes)"],
  never: ["Biometrics — HRV, sleep, heart rate", "Diagnostics & uploads", "Journal notes & reflections"],
};

const PRACTITIONER: RoleInfo = {
  title: "Biomeds",
  blurb: "Your doctor — only the health data you explicitly share.",
  hue: bio.color.blueLt2,
  can: ["Biometrics you share", "Diagnostics & uploads", "Journal check-ins you share"],
  never: ["Anything set to “No one”", "Progress photos, unless shared", "Your login & credentials"],
};

export function RolesScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.violet, size: 420, left: -120, top: -40, stops: [{ o: 0, a: 0.28 }, { o: 70, a: 0 }], variant: "a" },
          { hue: bio.aurora.blue, size: 340, right: -130, bottom: 60, stops: [{ o: 0, a: 0.13 }, { o: 70, a: 0 }], variant: "b", delayMs: -6000 },
        ]}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="What each role sees" label="In plain words" onBack={onBack} />

        <View style={styles.cards}>
          <RoleCard role={TRAINER} />
          <RoleCard role={PRACTITIONER} />
        </View>

        <Text style={styles.footer}>
          You can change who sees what any time — or switch it all back to{" "}
          <Text style={styles.footerStrong}>No one</Text>.
        </Text>
      </ScrollView>
    </View>
  );
}

function RoleCard({ role }: { role: RoleInfo }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.glyph, { borderColor: `${role.hue}52` }]}>
          <View style={[styles.glyphBar, { backgroundColor: role.hue }]} />
          <View style={[styles.glyphMid, { backgroundColor: role.hue }]} />
          <View style={[styles.glyphBar, { backgroundColor: role.hue }]} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{role.title}</Text>
          <Text style={styles.cardBlurb}>{role.blurb}</Text>
        </View>
      </View>

      <Text style={[styles.listLabel, { color: role.hue }]}>CAN SEE</Text>
      <View style={styles.list}>
        {role.can.map((item) => (
          <View key={item} style={styles.listRow}>
            <View style={[styles.check, { backgroundColor: role.hue }]}>
              <Svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                <Path
                  d="M2 5.2 L4.1 7.3 L8 3.2"
                  stroke={bio.color.onViolet}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <Text style={styles.listText}>{item}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.listLabelMuted}>NEVER SEES</Text>
      <View style={styles.list}>
        {role.never.map((item) => (
          <View key={item} style={styles.listRow}>
            <View style={styles.barred}>
              <View style={styles.barredLine} />
            </View>
            <Text style={styles.listTextMuted}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 22, flexGrow: 1 },

  cards: { gap: 13, marginTop: 18 },
  card: {
    borderRadius: bio.radius.card,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingVertical: 16,
    paddingHorizontal: 17,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  glyph: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: bio.alpha(0.05),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  glyphBar: { width: 4, height: 11, borderRadius: 2 },
  glyphMid: { width: 8, height: 2.6, borderRadius: 2 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 16, letterSpacing: -0.16, color: bio.color.text },
  cardBlurb: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.55), marginTop: 2 },

  listLabel: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 1.6, marginTop: 15, marginBottom: 9 },
  listLabelMuted: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: bio.alpha(0.4),
    marginTop: 15,
    marginBottom: 9,
  },
  list: { gap: 9 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  check: { width: 19, height: 19, borderRadius: 9.5, alignItems: "center", justifyContent: "center" },
  barred: {
    width: 19,
    height: 19,
    borderRadius: 9.5,
    borderWidth: 1.5,
    borderColor: bio.alpha(0.28),
    alignItems: "center",
    justifyContent: "center",
  },
  barredLine: { width: 11, height: 1.6, borderRadius: 2, backgroundColor: bio.alpha(0.4), transform: [{ rotate: "-45deg" }] },
  listText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.82) },
  listTextMuted: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.5) },

  footer: {
    marginTop: "auto",
    paddingTop: 14,
    textAlign: "center",
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: bio.alpha(0.45),
  },
  footerStrong: { fontFamily: fontFamily.semibold, color: bio.alpha(0.7) },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
