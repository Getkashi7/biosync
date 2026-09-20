/**
 * One of a client's progress photos, full-bleed — built to the 9D handoff.
 *
 * **Read-only, and that is the whole design.** The client's own viewer
 * (`PhotoDetailScreen`) carries a visibility toggle and a delete; this one
 * carries neither. A practitioner may look at a photo their client chose to
 * share and do nothing else to it. The absence of those controls is the
 * feature, so do not "complete" this screen by adding them.
 *
 * The date and the client's name sit over the image at the bottom, because the
 * only two things a viewer needs to know are whose body this is and when.
 */
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { fullPhotoDate } from "../../lib/photoFormat";
import type { ClientPhoto } from "./trainerApi";

export function ClientPhotoViewer({
  photo,
  clientName,
  onBack,
}: {
  photo: ClientPhoto;
  clientName: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      {photo.url ? (
        <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      ) : (
        // A photo whose signed URL could not be minted still opens, and says so.
        // Rendering nothing would look like a photo that is blank.
        <View style={styles.missing}>
          <Text style={styles.missingText}>This image couldn't be loaded.</Text>
        </View>
      )}

      {/* Scrims, so the chrome stays legible over a light photo. */}
      <LinearGradient
        colors={["rgba(7,7,12,0.66)", "rgba(7,7,12,0)"]}
        style={[styles.scrimTop, { height: insets.top + 110 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["rgba(7,7,12,0)", "rgba(7,7,12,0.8)"]}
        style={styles.scrimBottom}
        pointerEvents="none"
      />

      <Pressable
        onPress={() => {
          pressHaptic();
          onBack();
        }}
        hitSlop={12}
        style={({ pressed }) => [
          styles.back,
          { top: insets.top + 10 },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
          <Path
            d="M15 5l-7 7 7 7"
            stroke={bio.alpha(0.9)}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>

      <View style={[styles.caption, { bottom: insets.bottom + 36 }]}>
        <Text style={styles.date}>{fullPhotoDate(photo.takenOn).toUpperCase()}</Text>
        <Text style={styles.name}>{clientName}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  missing: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  missingText: { fontFamily: fontFamily.regular, fontSize: 14, color: bio.alpha(0.5) },

  scrimTop: { position: "absolute", top: 0, left: 0, right: 0 },
  scrimBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 240 },

  back: {
    position: "absolute",
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(7,7,12,0.55)",
    borderWidth: 1,
    borderColor: bio.alpha(0.18),
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { transform: [{ scale: 0.97 }] },

  caption: { position: "absolute", left: 26 },
  date: {
    fontFamily: fontFamily.dot,
    fontSize: 16,
    letterSpacing: 0.64,
    color: bio.alpha(0.95),
  },
  name: { fontFamily: fontFamily.medium, fontSize: 12.5, color: bio.alpha(0.6), marginTop: 5 },
});
