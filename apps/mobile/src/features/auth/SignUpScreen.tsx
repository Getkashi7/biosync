/**
 * Sign Up — name / email / password with a live strength meter, loading CTA.
 * On success the session flips and the root layout redirects to the app.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../../ui/Screen";
import { BackButton } from "../../ui/BackButton";
import { FloatingLabelField } from "../../ui/FloatingLabelField";
import { StrengthBar } from "../../ui/StrengthBar";
import { GradientButton } from "../../ui/GradientButton";
import { useKeyboardVisible } from "../../ui/useKeyboardVisible";
import { color, size, space, type } from "../../ui/theme";
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
      // Session now set → root layout redirects to (app).
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setLoading(false);
    }
  };

  const padBottom = keyboardVisible ? size.formPadBottomKeyboard : Math.max(insets.bottom + 14, space.lg);

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <BackButton onPress={() => router.back()} />
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Two minutes to your first insight.</Text>

          <View style={styles.fields}>
            <FloatingLabelField
              label="Full name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
            />
            <FloatingLabelField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <FloatingLabelField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secure
              autoComplete="new-password"
              textContentType="newPassword"
            />
          </View>

          <StrengthBar score={score} visible={password.length > 0} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={{ flex: 1, minHeight: space.lg }} />

          <View style={[styles.footer, { paddingBottom: padBottom }]}>
            <GradientButton label="Create Account" onPress={onSubmit} loading={loading} disabled={!canSubmit} />
            <Text style={styles.switchText}>
              Already have an account?{" "}
              <Text style={styles.link} onPress={() => router.replace("/(auth)/log-in")}>
                Log in
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: size.screenPadX,
  },
  title: {
    ...type.title,
    color: color.text,
    marginTop: space.xs,
  },
  subtitle: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: 6,
  },
  fields: {
    marginTop: 22,
    gap: size.fieldGap,
  },
  error: {
    ...type.caption,
    color: color.error,
    marginTop: space.md,
  },
  footer: {
    gap: 14,
  },
  switchText: {
    ...type.caption,
    color: color.textTertiary,
    textAlign: "center",
  },
  link: {
    color: color.link,
  },
});
