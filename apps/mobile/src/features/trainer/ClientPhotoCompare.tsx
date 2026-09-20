/**
 * Two of a client's photos side by side — built to the 9E handoff.
 *
 * The readout underneath is the point of the screen: two images prove nothing
 * without knowing how far apart they are, and "11 weeks" is the difference
 * between a change worth discussing and a change that is just a different
 * morning.
 *
 * **Which two.** The handoff draws the earliest and the latest of the shared
 * set, and that is what this does — there is no picker anywhere in the bundle.
 * It is also the honest default: the widest span the client has shared. A
 * two-tap picker is a reasonable later addition, but inventing one here would
 * mean designing it in code.
 *
 * Read-only, like the viewer. Nothing here can change or delete a photo.
 */
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { fullPhotoDate, weeksApart } from "../../lib/photoFormat";
import type { ClientPhoto } from "./trainerApi";

export function ClientPhotoCompare({
  earlier,
  later,
  clientName,
  onBack,
}: {
  earlier: ClientPhoto;
  later: ClientPhoto;
  clientName: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const weeks = weeksApart(earlier.takenOn, later.takenOn);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.frame,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              pressHaptic();
              onBack();
            }}
            hitSlop={12}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
              <Path
                d="M15 5l-7 7 7 7"
                stroke={bio.alpha(0.85)}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
          <View style={styles.flexMin}>
            <Text style={styles.title}>Compare</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {clientName}
            </Text>
          </View>
        </View>

        <View style={styles.pair}>
          <Pane photo={earlier} />
          <Pane photo={later} />
        </View>

        {weeks !== null ? (
          <View style={styles.readout}>
            <View style={styles.rule} />
            <View style={styles.readoutMid}>
              <Text style={styles.weeks}>{weeks}</Text>
              <Text style={styles.weeksLabel}>
                {weeks === 1 ? "WEEK APART" : "WEEKS APART"}
              </Text>
            </View>
            <View style={styles.rule} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Pane({ photo }: { photo: ClientPhoto }) {
  return (
    <View style={styles.flexMin}>
      <View style={styles.pane}>
        {photo.url ? (
          <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Text style={styles.paneMissing}>—</Text>
        )}
      </View>
      <Text style={styles.paneDate}>{fullPhotoDate(photo.takenOn).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  frame: { flex: 1, paddingHorizontal: 20 },
  flexMin: { flex: 1, minWidth: 0 },
  pressed: { transform: [{ scale: 0.97 }] },

  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fontFamily.bold, fontSize: 17.5, letterSpacing: -0.18, color: bio.color.text },
  subtitle: {
    fontFamily: fontFamily.medium,
    fontSize: 11.5,
    color: bio.alpha(0.55),
    marginTop: 2,
  },

  pair: { flexDirection: "row", gap: 10, marginTop: 22 },
  pane: {
    height: 244,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: bio.alpha(0.06),
    alignItems: "center",
    justifyContent: "center",
  },
  paneMissing: { fontFamily: fontFamily.regular, fontSize: 20, color: bio.alpha(0.3) },
  paneDate: {
    fontFamily: fontFamily.dot,
    fontSize: 11,
    letterSpacing: 0.66,
    color: bio.alpha(0.7),
    textAlign: "center",
    marginTop: 9,
  },

  readout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 26 },
  rule: { width: 36, height: 1, backgroundColor: bio.alpha(0.14) },
  readoutMid: { alignItems: "center" },
  weeks: { fontFamily: fontFamily.dot, fontSize: 26, lineHeight: 26, color: bio.alpha(0.92) },
  weeksLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 9.5,
    letterSpacing: 1.52,
    color: bio.alpha(0.45),
    marginTop: 5,
  },
});
