/**
 * Log In — email / password with the design's error pattern: on a failed
 * attempt the fields shake, borders + inline message turn red, and an error
 * haptic fires. Editing either field clears the error.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../../ui/Screen";
import { BackButton } from "../../ui/BackButton";
import { FloatingLabelField } from "../../ui/FloatingLabelField";
import { GradientButton } from "../../ui/GradientButton";
import { useShake } from "../../ui/useShake";
import { useKeyboardVisible } from "../../ui/useKeyboardVisible";
import { color, size, space, type } from "../../ui/theme";
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
      // Session now set → root layout redirects to (app).
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      shake.trigger();
      errorHaptic();
    }
  };

  const canSubmit = email.length > 0 && password.length > 0 && !loading;
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
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Pick up where you left off.</Text>

          <Animated.View style={[styles.fields, shake.style]}>
            <FloatingLabelField
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                clearError();
              }}
              error={!!error}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <FloatingLabelField
              label="Password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                clearError();
              }}
              error={!!error}
              secure
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          </Animated.View>

          <View style={styles.errorSlot}>{error ? <Text style={styles.error}>{error}</Text> : null}</View>
          <Text style={styles.forgot}>Forgot password?</Text>

          <View style={{ flex: 1, minHeight: space.lg }} />

          <View style={[styles.footer, { paddingBottom: padBottom }]}>
            <GradientButton label="Log In" onPress={onSubmit} loading={loading} disabled={!canSubmit} />
            <Text style={styles.switchText}>
              New to Pulse?{" "}
              <Text style={styles.link} onPress={() => router.replace("/(auth)/sign-up")}>
                Create an account
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
  errorSlot: {
    height: 24,
    marginTop: space.md,
  },
  error: {
    ...type.caption,
    color: color.error,
  },
  forgot: {
    ...type.caption,
    color: color.link,
    marginTop: space.xs,
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
