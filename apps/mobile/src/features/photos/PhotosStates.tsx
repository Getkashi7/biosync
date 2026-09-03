/**
 * The gallery's load states (designs 5A–5C).
 *
 * 5A is a skeleton of the grid rather than a spinner: it shows the shape of
 * what's coming, so the wait reads as "your photos are loading" instead of
 * "something is happening".
 *
 * 5B is the failure, and the copy is the point — "They're safe. Nothing was
 * deleted." A gallery that fails to load is frightening in a way a failed
 * dashboard isn't, because the obvious fear is that the photos are gone. The
 * wording says otherwise, and the offline / server distinction comes from
 * `classifyNetError` so it never blames the wrong thing.
 *
 * 5C (offline showing cached photos) is NOT here: it needs photos actually
 * saved on the device, and a banner claiming "showing photos saved on this
 * phone" over an empty grid would be exactly the kind of lie this feature is
 * built to avoid. Until caching exists, offline renders 5B with offline copy.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import type { NetFailure } from "../../lib/netError";

const S = bio.photos;
const PULSE_MS = 1800;

/** One pulsing placeholder, staggered so the grid breathes rather than blinks. */
function Pulse({ style, delay }: { style: object; delay: number }) {
  const p = useSharedValue(0.45);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: PULSE_MS / 2, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [delay, p]);
  const animated = useAnimatedStyle(() => ({ opacity: p.value }));
  return <Animated.View style={[style, animated]} />;
}

/** 5A — the shape of the grid, before it has anything in it. */
export function PhotosSkeleton() {
  return (
    <View accessibilityLabel="Loading your photos">
      <Pulse style={styles.headLine} delay={0} />
      <Pulse style={styles.monthLine} delay={300} />
      <View style={styles.grid}>
        {[0, 200, 400, 600, 800, 1000].map((d) => (
          <Pulse key={d} style={styles.skeletonTile} delay={d} />
        ))}
      </View>
    </View>
  );
}

/** 5B — the honest failure. */
export function PhotosFailed({ kind, onRetry }: { kind: NetFailure; onRetry: () => void }) {
  return (
    <View style={styles.failed}>
      <View style={styles.bang}>
        <Text style={styles.bangText}>!</Text>
      </View>
      <Text style={styles.failedTitle}>Couldn&apos;t load your photos</Text>
      <Text style={styles.failedBody}>
        {kind === "offline"
          ? "They're safe — you just look offline. Nothing was deleted."
          : "They're safe — we just couldn't reach the server. Nothing was deleted."}
      </Text>
      <Pressable
        onPress={() => {
          pressHaptic();
          onRetry();
        }}
        style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <LinearGradient
          colors={[bio.color.violet, bio.color.violetDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.retryFill}
        >
          <Text style={styles.retryText}>Try again</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headLine: {
    width: 200,
    height: 10,
    borderRadius: 5,
    backgroundColor: bio.alpha(0.08),
    marginTop: 20,
  },
  monthLine: {
    width: 64,
    height: 9,
    borderRadius: 5,
    backgroundColor: bio.alpha(0.08),
    marginTop: 24,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.tile.gap, marginTop: 12 },
  skeletonTile: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    maxWidth: 112,
    height: S.tile.height,
    borderRadius: S.tile.radius,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.07),
  },

  failed: { alignItems: "center", paddingTop: 96, paddingHorizontal: 24 },
  bang: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,154,144,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  bangText: { fontFamily: fontFamily.extrabold, fontSize: 17, color: bio.color.coralLt2 },
  failedTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16.5,
    color: bio.color.text,
    marginTop: 18,
    textAlign: "center",
  },
  failedBody: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 19,
    color: bio.alpha(0.55),
    marginTop: 9,
    textAlign: "center",
  },
  retry: { borderRadius: 14, overflow: "hidden", marginTop: 24 },
  retryPressed: { transform: [{ scale: 0.98 }] },
  retryFill: { height: 48, paddingHorizontal: 30, alignItems: "center", justifyContent: "center" },
  retryText: { fontFamily: fontFamily.bold, fontSize: 13.5, color: bio.color.onViolet },
});
