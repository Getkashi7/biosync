/**
 * The last line of defence: what the app shows when a render throws.
 *
 * This replaced `Sentry.ErrorBoundary`, which was strictly worse than nothing.
 * With no `fallback` prop, `@sentry/react`'s boundary renders `null` — so an
 * unhandled error produced a **blank white screen** with no explanation and no
 * way out. And it wasn't even reporting: `Sentry.init` is guarded on
 * `EXPO_PUBLIC_SENTRY_DSN`, which no build profile sets, so nothing was ever
 * sent anywhere.
 *
 * The same principle as `ui/bio/LoadFailed`, one level up: say what happened,
 * say what it means for the user's data, and offer the way forward. A person
 * whose health app just went blank needs to know their check-ins are still
 * there — that is the sentence that matters, and it is true, because everything
 * is on the server and nothing here was mid-write.
 *
 * Deliberately a class component: `componentDidCatch` has no hook equivalent.
 * Deliberately dependency-free, so the thing that catches crashes cannot itself
 * be the crash — no theme import, no SVG, no Reanimated. The colours are the
 * only hard-coded ones in the app and they mirror `bio.color.ink` / `.text`.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The only place in the app that logs an exception. Safe: a stack trace is
    // our code, not the user's data — and per CLAUDE.md no health value is
    // logged, which is why the error is printed and nothing about app state is.
    console.error("[boundary] unhandled render error", error.message, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.body}>
            Nothing has been lost — your check-ins, photos and logs are saved on the server, not
            in this screen.
          </Text>
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>Try again</Text>
          </Pressable>
          <Text style={styles.detail} numberOfLines={3}>
            {error.message}
          </Text>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0B12", alignItems: "center", justifyContent: "center", padding: 28 },
  card: { width: "100%", maxWidth: 380 },
  title: { fontSize: 20, fontWeight: "700", color: "#F4F2F8" },
  body: { fontSize: 14, lineHeight: 21, color: "rgba(244,242,248,0.6)", marginTop: 10 },
  cta: {
    height: 50,
    borderRadius: 15,
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(94,212,192,0.14)",
    borderWidth: 1,
    borderColor: "rgba(94,212,192,0.4)",
  },
  ctaText: { fontSize: 14.5, fontWeight: "600", color: "#5ED4C0" },
  // Shown small and last: useful when someone screenshots it, never the headline.
  detail: { fontSize: 11, lineHeight: 16, color: "rgba(244,242,248,0.3)", marginTop: 18 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
