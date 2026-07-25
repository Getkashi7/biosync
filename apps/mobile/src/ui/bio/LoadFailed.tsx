/**
 * "Couldn't load this" — the state a screen shows when a fetch failed.
 *
 * This exists because the alternative kept happening by accident: a `catch`
 * that sets the data to `null` or `[]` produces a screen that either spins
 * forever or, worse, calmly reports that there's nothing there. "No notes from
 * your trainer" and "we couldn't reach the server" are very different claims,
 * and only one of them is true when the request failed.
 *
 * So: never render an empty state on failure. Say it failed, and offer the
 * retry — the fix is almost always "try again in a second".
 */
import { StyleSheet, Text, View } from "react-native";
import { GradientButton } from "../GradientButton";
import { bio, fontFamily } from "../theme";
import type { NetFailure } from "../../lib/netError";

export function LoadFailed({
  /** what couldn't be loaded, e.g. "your care team" */
  what,
  /** why, so the message doesn't blame the user's wi-fi for our 500 */
  kind = "offline",
  onRetry,
}: {
  what: string;
  kind?: NetFailure;
  onRetry: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Couldn't load {what}</Text>
      <Text style={styles.body}>
        {kind === "offline"
          ? "You look offline. Check your connection — nothing has been lost."
          : "Something went wrong on our end. Nothing has been lost."}
      </Text>
      <View style={styles.cta}>
        <GradientButton label="Try again" variant="ghost" onPress={onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },
  title: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.text, textAlign: "center" },
  body: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 19.4,
    color: bio.alpha(0.55),
    textAlign: "center",
    maxWidth: 280,
    marginTop: 8,
  },
  cta: { marginTop: 18, minWidth: 160 },
});
