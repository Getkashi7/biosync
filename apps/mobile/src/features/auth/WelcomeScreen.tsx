/**
 * Welcome — wordmark + tagline, Create Account (gradient) / Log In (ghost).
 * Elements rise in with a 100ms stagger. No inputs; CTAs sit in the thumb zone.
 */
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../../ui/Screen";
import { RiseIn } from "../../ui/RiseIn";
import { LogoMark } from "../../ui/LogoMark";
import { GradientButton } from "../../ui/GradientButton";
import { color, size, space, type } from "../../ui/theme";

export function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
        <View style={{ flex: 1 }} />

        <View>
          <RiseIn index={0} style={styles.logoWrap}>
            <LogoMark />
          </RiseIn>
          <RiseIn index={1}>
            <Text style={styles.wordmark}>Pulse</Text>
          </RiseIn>
          <RiseIn index={2}>
            <Text style={styles.tagline}>Your body, decoded.</Text>
          </RiseIn>
        </View>

        <View style={{ flex: 1.1 }} />

        <RiseIn index={3} style={[styles.actions, { paddingBottom: Math.max(insets.bottom + 14, 24) }]}>
          <GradientButton label="Create Account" onPress={() => router.push("/(auth)/sign-up")} />
          <GradientButton label="Log In" variant="ghost" onPress={() => router.push("/(auth)/log-in")} />
        </RiseIn>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: size.screenPadX,
  },
  logoWrap: {
    marginBottom: 28,
  },
  wordmark: {
    ...type.display,
    color: color.text,
  },
  tagline: {
    ...type.body,
    color: color.textSecondary,
    marginTop: space.md,
  },
  actions: {
    gap: space.md,
  },
});
