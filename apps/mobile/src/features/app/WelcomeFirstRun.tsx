/**
 * First run — the one screen a new account sees before the app itself.
 *
 * It exists because of a specific, repeatable bad first impression: a new
 * account landed on a dashboard showing "AWAITING" and an empty ring, with
 * nothing explaining that readiness needs a few days of data before it means
 * anything. People read that as a broken app rather than an empty one.
 *
 * So this sets three expectations and then gets out of the way:
 *  1. what the daily loop actually is (20 seconds, once a day),
 *  2. that the score needs a few days before it's worth trusting,
 *  3. that nothing is shared with anyone unless they choose to share it.
 *
 * One screen, not a carousel. Anything longer gets skipped, and a skipped
 * explanation is worse than none because it looks like it was covered.
 *
 * There's no "skip" because there's nothing to skip past — the primary action
 * IS the first check-in, and the secondary one just opens the app.
 */
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { GradientButton } from "../../ui/GradientButton";
import { bio, fontFamily } from "../../ui/theme";

const BLOBS = [
  {
    hue: bio.aurora.teal,
    size: 460,
    cx: true,
    top: 40,
    stops: [
      { o: 0, a: 0.3 },
      { o: 48, a: 0.12 },
      { o: 74, a: 0 },
    ],
    variant: "a" as const,
  },
  {
    hue: bio.aurora.violet,
    size: 320,
    left: -120,
    bottom: 120,
    stops: [
      { o: 0, a: 0.2 },
      { o: 70, a: 0 },
    ],
    variant: "b" as const,
    delayMs: -6000,
  },
];

const POINTS: { hue: string; title: string; body: string }[] = [
  {
    hue: bio.color.violet,
    title: "Check in once a day",
    body: "Sleep, energy and mood — about twenty seconds. That's the whole habit.",
  },
  {
    hue: bio.color.teal,
    title: "Readiness needs a few days",
    body: "Your score compares today against your own baseline, so it stays quiet until it has enough to compare with.",
  },
  {
    hue: bio.color.blue,
    title: "Nothing is shared",
    body: "Not with your PT, not with anyone — unless you turn it on yourself, one category at a time.",
  },
];

export function WelcomeFirstRun({
  name,
  onStartCheckin,
  onExplore,
}: {
  /** first name if we have one — the greeting works without it */
  name?: string | undefined;
  onStartCheckin: () => void;
  onExplore: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <AuroraField blobs={BLOBS} />
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 }]}>
        <Text style={styles.eyebrow}>WELCOME TO BIOSYNC</Text>
        <Text style={styles.title}>{name ? `Hello, ${name}.` : "Hello."}</Text>
        <Text style={styles.lede}>Here's how this works — it's shorter than you'd think.</Text>

        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.title} style={styles.point}>
              <View style={[styles.dot, { backgroundColor: p.hue }]} />
              <View style={styles.pointText}>
                <Text style={styles.pointTitle}>{p.title}</Text>
                <Text style={styles.pointBody}>{p.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.spacer} />

        <GradientButton label="Do your first check-in" onPress={onStartCheckin} />
        <View style={styles.secondary}>
          <GradientButton label="Look around first" variant="ghost" onPress={onExplore} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  content: { flex: 1, paddingHorizontal: 24 },

  eyebrow: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.68,
    color: bio.alpha(0.45),
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 30,
    letterSpacing: -0.45,
    color: bio.color.text,
    marginTop: 8,
  },
  lede: {
    fontFamily: fontFamily.light,
    fontSize: 14,
    lineHeight: 21,
    color: bio.alpha(0.6),
    marginTop: 10,
  },

  points: { marginTop: 40, gap: 22 },
  point: { flexDirection: "row", gap: 14 },
  dot: { width: 8, height: 8, borderRadius: 8, marginTop: 6 },
  pointText: { flex: 1 },
  pointTitle: { fontFamily: fontFamily.semibold, fontSize: 15.5, color: bio.color.text },
  pointBody: {
    fontFamily: fontFamily.light,
    fontSize: 13,
    lineHeight: 20,
    color: bio.alpha(0.6),
    marginTop: 4,
  },

  spacer: { flex: 1, minHeight: 32 },
  secondary: { marginTop: 10 },
});
