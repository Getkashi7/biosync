/**
 * Photo detail (design 4A) — the full photo, its date, the weight that day,
 * per-photo visibility, and an honest delete.
 *
 * Two things here are load-bearing rather than cosmetic:
 *
 * - **The confirm says what deleting actually does.** "It's removed for
 *   everyone it's shared with — not just hidden from you. This can't be
 *   undone." Keep is the primary (violet) action and Delete is the quiet one,
 *   because the destructive path should never be the easy mis-tap.
 * - **The override row explains itself.** When a photo's visibility differs
 *   from the gallery default it says so and offers Reset to default, so the
 *   lock chip on the grid always has an explanation one tap away.
 */
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic, selectionHaptic } from "../../lib/haptics";
import { fullPhotoDate } from "../../lib/photoFormat";
import { deletePhoto, setPhotoVisibility, type ConsentAudience, type Photo } from "./photosApi";
import { fetchWeightOn } from "./photoMetrics";

const AUDIENCES: { value: ConsentAudience; label: string }[] = [
  { value: "NONE", label: "Only me" },
  { value: "TRAINER", label: "My trainer" },
  { value: "PRACTITIONER", label: "My practitioner" },
];

const AUDIENCE_WORD: Record<ConsentAudience, string> = {
  NONE: "Only me",
  TRAINER: "My trainer",
  PRACTITIONER: "My practitioner",
};

export function PhotoDetailScreen({
  photo,
  galleryDefault,
  unit,
  onBack,
  onDeleted,
}: {
  photo: Photo;
  galleryDefault: ConsentAudience;
  unit: "kg" | "lb";
  onBack: () => void;
  onDeleted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [audience, setAudience] = useState<ConsentAudience>(photo.audienceOverride ?? galleryDefault);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchWeightOn(photo.takenOn).then(setWeight).catch(() => setWeight(null));
  }, [photo.takenOn]);

  const isOverride = audience !== galleryDefault;

  const applyAudience = useCallback(
    async (next: ConsentAudience) => {
      selectionHaptic();
      const previous = audience;
      setAudience(next);
      setError(null);
      try {
        // Null when it matches the gallery default: an override equal to the
        // default would light the lock chip on a photo that isn't different.
        await setPhotoVisibility(photo.id, next === galleryDefault ? null : next);
      } catch {
        setAudience(previous);
        setError("Couldn't change who can see this. It's unchanged — please try again.");
      }
    },
    [audience, galleryDefault, photo.id],
  );

  const doDelete = useCallback(async () => {
    pressHaptic();
    setConfirming(false);
    setError(null);
    try {
      await deletePhoto(photo.id);
      setDeleted(true);
      // Let the confirmation land before leaving, so the user sees that it
      // actually happened rather than being dropped back to the grid.
      setTimeout(onDeleted, 1200);
    } catch {
      setError("The photo could not be deleted. It has not been removed — please try again.");
    }
  }, [onDeleted, photo.id]);

  return (
    <View style={styles.root}>
      {photo.url ? (
        <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={["#2E2A38", "#1A1724"]} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={["rgba(7,7,12,0.8)", "rgba(7,7,12,0)"]}
        style={styles.topScrim}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["rgba(7,7,12,0)", "rgba(7,7,12,0.88)"]}
        style={styles.bottomScrim}
        pointerEvents="none"
      />
      {deleted ? <View style={styles.deletedVeil} pointerEvents="none" /> : null}

      <Pressable
        onPress={() => {
          pressHaptic();
          onBack();
        }}
        style={({ pressed }) => [styles.back, { top: insets.top + 10 }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Svg width={10} height={10} viewBox="0 0 10 10" fill="none">
          <Path d="M6.5 1 L2.5 5 L6.5 9" stroke={bio.alpha(0.85)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>

      {deleted ? (
        <View style={[styles.card, { bottom: insets.bottom + 26 }, styles.cardCentre]}>
          <Text style={styles.deletedTitle}>Photo deleted</Text>
          <Text style={styles.deletedBody}>Removed for everyone it was shared with.</Text>
        </View>
      ) : (
        <View style={[styles.card, { bottom: insets.bottom + 26 }]}>
          <View style={styles.cardHead}>
            <Text style={styles.date}>{fullPhotoDate(photo.takenOn).toUpperCase()}</Text>
            {weight !== null ? (
              <Text style={styles.weight}>
                Weight that day · <Text style={styles.weightValue}>{formatWeight(weight, unit)}</Text>
              </Text>
            ) : null}
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>Who can see it</Text>
          <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Who can see this photo">
            {AUDIENCES.map((a) => {
              const on = audience === a.value;
              return (
                <Pressable
                  key={a.value}
                  onPress={() => void applyAudience(a.value)}
                  style={[styles.segCell, on && styles.segCellOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={a.label}
                >
                  <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {isOverride ? (
            <View style={styles.overrideRow}>
              <Text style={styles.overrideText}>
                Overrides your {AUDIENCE_WORD[galleryDefault].toLowerCase()} default.
              </Text>
              <Pressable
                onPress={() => void applyAudience(galleryDefault)}
                style={({ pressed }) => [pressed && styles.dim]}
                accessibilityRole="button"
                accessibilityLabel="Reset to default"
              >
                <Text style={styles.resetLink}>Reset to default</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.defaultNote}>
              {galleryDefault === "NONE"
                ? "Your Photos default — only you can see it."
                : `Your Photos default — ${AUDIENCE_WORD[galleryDefault].toLowerCase()} can see it.`}
            </Text>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => {
              pressHaptic();
              setConfirming(true);
            }}
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel="Delete photo"
          >
            <Text style={styles.deleteText}>Delete photo</Text>
          </Pressable>
        </View>
      )}

      {confirming ? (
        <View style={styles.confirmLayer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirming(false)} accessibilityLabel="Keep photo" />
          <View style={[styles.confirmCard, { marginBottom: insets.bottom + 26 }]}>
            <Text style={styles.confirmTitle}>Delete this photo?</Text>
            <Text style={styles.confirmBody}>
              It&apos;s removed for everyone it&apos;s shared with — not just hidden from you. This
              can&apos;t be undone.
            </Text>
            {/* Keeping is the primary action on purpose: the destructive path
                should never be the easy mis-tap. */}
            <Pressable
              onPress={() => {
                pressHaptic();
                setConfirming(false);
              }}
              style={({ pressed }) => [styles.keepBtn, pressed && styles.scaleDown]}
              accessibilityRole="button"
              accessibilityLabel="Keep photo"
            >
              <LinearGradient
                colors={[bio.color.violet, bio.color.violetDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.keepFill}
              >
                <Text style={styles.keepText}>Keep photo</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => void doDelete()}
              style={({ pressed }) => [styles.confirmDelete, pressed && styles.dim]}
              accessibilityRole="button"
              accessibilityLabel="Delete permanently"
            >
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function formatWeight(kg: number, unit: "kg" | "lb"): string {
  return unit === "lb" ? `${(kg * 2.20462).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 150 },
  bottomScrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: 320 },
  deletedVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7,7,12,0.6)" },

  back: {
    position: "absolute",
    left: 22,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(11,11,18,0.55)",
    borderWidth: 1,
    borderColor: bio.alpha(0.2),
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  pressed: { transform: [{ scale: 0.94 }] },
  dim: { opacity: 0.6 },
  scaleDown: { transform: [{ scale: 0.98 }] },

  card: {
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: 24,
    backgroundColor: "#1B1A27",
    borderWidth: 1,
    borderColor: bio.alpha(0.14),
    paddingVertical: 18,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  cardCentre: { alignItems: "center", paddingVertical: 20 },
  cardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  date: { fontFamily: fontFamily.dot, fontSize: 19, color: bio.color.text },
  weight: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.55), flexShrink: 1 },
  weightValue: { fontFamily: fontFamily.semibold, color: bio.alpha(0.8) },

  divider: { height: 1, backgroundColor: bio.alpha(0.08), marginTop: 14 },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.47,
    textTransform: "uppercase",
    color: bio.alpha(0.45),
    marginTop: 13,
  },
  segment: {
    flexDirection: "row",
    gap: 3,
    height: 40,
    borderRadius: 13,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    padding: 3,
    marginTop: 9,
  },
  segCell: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  segCellOn: { backgroundColor: bio.violetAlpha(0.17), borderColor: bio.violetAlpha(0.55) },
  segText: { fontFamily: fontFamily.semibold, fontSize: 10.5, color: bio.alpha(0.55) },
  segTextOn: { color: bio.color.violetChip },

  overrideRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 },
  overrideText: { fontFamily: fontFamily.light, fontSize: 11, lineHeight: 16, color: bio.alpha(0.5), flex: 1 },
  resetLink: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.color.violetChip },
  defaultNote: { fontFamily: fontFamily.light, fontSize: 11, color: bio.alpha(0.45), marginTop: 10 },
  error: { fontFamily: fontFamily.regular, fontSize: 11.5, lineHeight: 17, color: bio.color.coralLt2, marginTop: 10 },

  deleteBtn: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,122,110,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  deleteText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.coralLt2 },

  confirmLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
    backgroundColor: "rgba(7,7,12,0.65)",
    justifyContent: "flex-end",
    padding: 20,
  },
  confirmCard: {
    borderRadius: 24,
    backgroundColor: "#1B1A27",
    borderWidth: 1,
    borderColor: bio.alpha(0.14),
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  confirmTitle: { fontFamily: fontFamily.bold, fontSize: 17, letterSpacing: -0.17, color: bio.color.text },
  confirmBody: { fontFamily: fontFamily.light, fontSize: 13, lineHeight: 20, color: bio.alpha(0.65), marginTop: 9 },
  keepBtn: { height: 50, borderRadius: 15, overflow: "hidden", marginTop: 18 },
  keepFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  keepText: { fontFamily: fontFamily.bold, fontSize: 14, color: bio.color.onViolet },
  confirmDelete: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,122,110,0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 9,
  },

  deletedTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: bio.color.text },
  deletedBody: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.55), marginTop: 6, textAlign: "center" },
});
