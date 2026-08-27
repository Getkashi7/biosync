/**
 * Sign Up — BIOSYNC redesign. Aurora field, glass fields, a live strength meter,
 * and a solid CTA. On success the session flips and the root layout redirects.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { GlassField } from "../../ui/bio/GlassField";
import { StrengthBar } from "../../ui/StrengthBar";
import { Spinner } from "../../ui/Spinner";
import { useKeyboardVisible } from "../../ui/useKeyboardVisible";
import { bio, fontFamily } from "../../ui/theme";
import { successHaptic } from "../../lib/haptics";
import { scorePassword } from "./passwordStrength";
import { useAuth } from "./AuthProvider";

export function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = scorePassword(password);
  const canSubmit = name.length > 0 && email.length > 0 && password.length > 0 && !loading;

  const onSubmit = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await signUp({ fullName: name, email: email.trim(), password });
      successHaptic();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setLoading(false);
    }
  };

  const padBottom = keyboardVisible ? 12 : Math.max(insets.bottom + 14, 24);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <AuroraField
        blobs={[
          { hue: bio.aurora.teal, size: 440, left: -160, top: -160, stops: [{ o: 0, a: 0.4 }, { o: 45, a: 0.13 }, { o: 72, a: 0 }] },
          { hue: bio.aurora.violet, size: 360, right: -140, bottom: 120, stops: [{ o: 0, a: 0.3 }, { o: 70, a: 0 }], variant: "b", delayMs: -6000 },
        ]}
      />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Pressable style={styles.back} onPress={() => { if (router.canGoBack()) router.back(); }} accessibilityRole="button" accessibilityLabel="Back">
            <Svg width={9} height={9} viewBox="0 0 9 9" fill="none">
              <Path d="M6 1 L2 4.5 L6 8" stroke={bio.alpha(0.8)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Two minutes of setup, then BIOSYNC starts listening to your patterns.</Text>

          <View style={styles.fields}>
            <GlassField label="Full name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" textContentType="name" />
            <GlassField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
            <GlassField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          </View>

          <View style={styles.strength}>
            <StrengthBar score={score} visible={password.length > 0} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.spacer} />

          <View style={[styles.footer, { paddingBottom: padBottom }]}>
            <Pressable style={[styles.primary, !canSubmit && styles.primaryOff]} onPress={onSubmit} disabled={!canSubmit} accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }}>
              {loading ? <Spinner tint={bio.color.ink} /> : <Text style={styles.primaryTxt}>Create account</Text>}
            </Pressable>
            <Text style={styles.switchText}>
              Already have an account?{" "}
              <Text style={styles.link} onPress={() => router.replace("/(auth)/log-in")}>
                Log in
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
  title: { fontFamily: fontFamily.bold, fontSize: 28, letterSpacing: -0.28, color: bio.color.text, marginTop: 24 },
  subtitle: { fontFamily: fontFamily.light, fontSize: 14, lineHeight: 21, color: bio.alpha(0.55), marginTop: 8 },
  fields: { marginTop: 30, gap: 12 },
  strength: { marginTop: 14 },
  error: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.coral, marginTop: 12 },
  spacer: { flex: 1, minHeight: 24 },
  footer: { gap: 14 },
  primary: { height: 56, borderRadius: 999, backgroundColor: bio.color.text, alignItems: "center", justifyContent: "center" },
  primaryOff: { opacity: 0.45 },
  primaryTxt: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.ink },
  switchText: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.5), textAlign: "center" },
  link: { fontFamily: fontFamily.semibold, color: bio.color.blueLt },
});
