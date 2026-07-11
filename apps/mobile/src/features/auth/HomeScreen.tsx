/**
 * Success / home — the gated destination after auth. Fades through on entry
 * (handled by the route), then elements rise in. "Sign out" returns to auth.
 */
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../../ui/Screen";
import { RiseIn } from "../../ui/RiseIn";
import { GradientButton } from "../../ui/GradientButton";
import { LogoMark } from "../../ui/LogoMark";
import { color, size, space, type } from "../../ui/theme";
import { useAuth } from "./AuthProvider";

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, session } = useAuth();

  return (
    <Screen>
      <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
        <View style={{ flex: 1 }} />

        <RiseIn index={0} style={styles.checkWrap}>
          <View style={styles.check}>
            <LogoMark diameter={72} />
            <Text style={styles.checkMark}>✓</Text>
          </View>
        </RiseIn>
        <RiseIn index={1}>
          <Text style={styles.heading}>You’re in.</Text>
        </RiseIn>
        <RiseIn index={2}>
          <Text style={styles.sub}>Next: a 60-second baseline scan.</Text>
        </RiseIn>
        {session ? (
          <RiseIn index={2}>
            <Text style={styles.email}>{session.email}</Text>
          </RiseIn>
        ) : null}

        <View style={{ flex: 1.2 }} />

        <RiseIn index={3} style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 14, 24) }]}>
          <GradientButton label="Sign out" variant="ghost" onPress={() => void signOut()} />
        </RiseIn>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: size.screenPadX,
    alignItems: "center",
  },
  checkWrap: {
    alignItems: "center",
  },
  check: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: {
    position: "absolute",
    color: color.onGradient,
    fontSize: 30,
    fontWeight: "700",
  },
  heading: {
    ...type.success,
    color: color.text,
    marginTop: 28,
    textAlign: "center",
  },
  sub: {
    ...type.body,
    color: color.textSecondary,
    marginTop: space.sm,
    textAlign: "center",
  },
  email: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: space.sm,
    textAlign: "center",
  },
  footer: {
    width: "100%",
  },
});
