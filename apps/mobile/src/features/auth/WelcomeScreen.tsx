/**
 * Welcome — BIOSYNC redesign. Aurora field, the beating dotted-heart mark, the
 * wordmark + tagline, and two thumb-zone CTAs (solid "Get started" / glass
 * "I have an account").
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { DottedHeart } from "../../ui/bio/DottedHeart";
import { bio, fontFamily } from "../../ui/theme";

export function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <AuroraField
        blobs={[
          { hue: bio.aurora.violet, size: 460, left: -140, top: -100, stops: [{ o: 0, a: 0.5 }, { o: 45, a: 0.16 }, { o: 72, a: 0 }], variant: "a" },
          { hue: bio.aurora.teal, size: 420, right: -160, bottom: -60, stops: [{ o: 0, a: 0.42 }, { o: 45, a: 0.14 }, { o: 72, a: 0 }], variant: "b", delayMs: -4000 },
          { hue: bio.aurora.coral, size: 240, left: 80, top: 340, stops: [{ o: 0, a: 0.22 }, { o: 70, a: 0 }], variant: "a", delayMs: -7000 },
        ]}
      />

      <View style={styles.center}>
        <DottedHeart size={64} />
        <Text style={styles.wordmark}>BIOSYNC</Text>
        <Text style={styles.tagline}>Your body, in tune.</Text>
      </View>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom + 14, 28) }]}>
        <Pressable style={styles.primary} onPress={() => router.push("/(auth)/sign-up")} accessibilityRole="button">
          <Text style={styles.primaryTxt}>Get started</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push("/(auth)/log-in")} accessibilityRole="button">
          <Text style={styles.secondaryTxt}>I have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink, overflow: "hidden" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    letterSpacing: 12,
    color: bio.color.text,
    marginTop: 26,
    marginLeft: 12,
    textAlign: "center",
  },
  tagline: { fontFamily: fontFamily.light, fontSize: 15, color: bio.alpha(0.6), marginTop: 14 },
  actions: { paddingHorizontal: 24, gap: 12 },
  primary: {
    height: 56,
    borderRadius: 999,
    backgroundColor: bio.color.text,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryTxt: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.ink },
  secondary: {
    height: 56,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryTxt: { fontFamily: fontFamily.medium, fontSize: 15, color: bio.alpha(0.85) },
});
