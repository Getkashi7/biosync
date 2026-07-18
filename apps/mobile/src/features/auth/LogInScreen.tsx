/**
 * Log In — BIOSYNC redesign. Aurora field, glass fields, and the design's error
 * pattern: on a failed attempt the fields shake + an inline message turns coral.
 * Editing either field clears the error.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { GlassField } from "../../ui/bio/GlassField";
import { Spinner } from "../../ui/Spinner";
import { useShake } from "../../ui/useShake";
import { useKeyboardVisible } from "../../ui/useKeyboardVisible";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, successHaptic } from "../../lib/haptics";
import { useAuth } from "./AuthProvider";

export function LogInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { signIn } = useAuth();
  const shake = useShake();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => {
    if (error) setError(null);
  };

  const onSubmit = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await signIn({ email: email.trim(), password });
      successHaptic();
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      shake.trigger();
      errorHaptic();
    }
  };

  const canSubmit = email.length > 0 && password.length > 0 && !loading;
  const padBottom = keyboardVisible ? 12 : Math.max(insets.bottom + 14, 24);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <AuroraField
        blobs={[{ hue: bio.aurora.magenta, size: 480, cx: true, top: -220, stops: [{ o: 0, a: 0.3 }, { o: 45, a: 0.14 }, { o: 72, a: 0 }] }]}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <Svg width={9} height={9} viewBox="0 0 9 9" fill="none">
              <Path d="M6 1 L2 4.5 L6 8" stroke={bio.alpha(0.8)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>

          <Text style={styles.wordmark}>BIOSYNC</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Your readiness is waiting.</Text>

          <Animated.View style={[styles.fields, shake.style]}>
            <GlassField
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                clearError();
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <GlassField
              label="Password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                clearError();
              }}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          </Animated.View>

          <View style={styles.errorSlot}>{error ? <Text style={styles.error}>{error}</Text> : null}</View>
          <Text style={styles.forgot}>Forgot password?</Text>

          <View style={styles.spacer} />

          <View style={[styles.footer, { paddingBottom: padBottom }]}>
            <Pressable style={[styles.primary, !canSubmit && styles.primaryOff]} onPress={onSubmit} disabled={!canSubmit} accessibilityRole="button">
              {loading ? <Spinner tint={bio.color.ink} /> : <Text style={styles.primaryTxt}>Log in</Text>}
            </Pressable>
            <Text style={styles.switchText}>
              New to BIOSYNC?{" "}
              <Text style={styles.link} onPress={() => router.replace("/(auth)/sign-up")}>
                Create an account
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink, overflow: "hidden" },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: { fontFamily: fontFamily.semibold, fontSize: 13, letterSpacing: 4.4, color: bio.alpha(0.5), textAlign: "center", marginTop: 26 },
  title: { fontFamily: fontFamily.bold, fontSize: 28, letterSpacing: -0.28, color: bio.color.text, textAlign: "center", marginTop: 18 },
  subtitle: { fontFamily: fontFamily.light, fontSize: 14, color: bio.alpha(0.55), textAlign: "center", marginTop: 8 },
  fields: { marginTop: 36, gap: 12 },
  errorSlot: { minHeight: 22, marginTop: 12 },
  error: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.coral },
  forgot: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.blueLt, textAlign: "right", marginTop: 4 },
  spacer: { flex: 1, minHeight: 24 },
  footer: { gap: 14 },
  primary: { height: 56, borderRadius: 999, backgroundColor: bio.color.text, alignItems: "center", justifyContent: "center" },
  primaryOff: { opacity: 0.45 },
  primaryTxt: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.ink },
  switchText: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.5), textAlign: "center" },
  link: { fontFamily: fontFamily.semibold, color: bio.color.blueLt },
});
