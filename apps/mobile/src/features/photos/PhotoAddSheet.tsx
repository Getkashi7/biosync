/**
 * Add a photo (design 2A) — camera or library, a pose-guide toggle, and the
 * visibility selector.
 *
 * The visibility control is the existing consent model, so it is mutually
 * exclusive: one audience per photo, "Only me" being NONE. It opens on the
 * gallery-wide default (marked with a violet dot) taken from Who sees what →
 * Photos, and the note underneath states the consequence of the current choice
 * in plain words rather than leaving the user to infer it.
 *
 * The honest case the design insists on: picking "My practitioner" while no
 * practitioner is connected warns, in amber, that no one will see the photo —
 * because sharing needs BOTH consent and an active link, and a selector that
 * silently did nothing would be a lie.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { bio, fontFamily, motion } from "../../ui/theme";
import { pressHaptic, selectionHaptic } from "../../lib/haptics";
import { pickPhoto, type PickedPhoto } from "./photoPicker";
import type { ConsentAudience } from "./photosApi";

const AUDIENCES: { value: ConsentAudience; label: string }[] = [
  { value: "NONE", label: "Only me" },
  { value: "TRAINER", label: "My trainer" },
  { value: "PRACTITIONER", label: "My practitioner" },
];

export function PhotoAddSheet({
  galleryDefault,
  practitionerConnected,
  trainerConnected,
  onClose,
  onPicked,
}: {
  /** The PHOTOS consent audience — what this photo follows unless overridden. */
  galleryDefault: ConsentAudience;
  practitionerConnected: boolean;
  trainerConnected: boolean;
  onClose: () => void;
  onPicked: (photo: PickedPhoto, audienceOverride: ConsentAudience | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [audience, setAudience] = useState<ConsentAudience>(galleryDefault);
  const [guide, setGuide] = useState(true);
  const [pickError, setPickError] = useState<string | null>(null);

  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);

  useEffect(() => setAudience(galleryDefault), [galleryDefault]);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut }, (f) => {
      if (f) runOnJS(onClose)();
    });
  }, [onClose, scrimP, sheetP]);

  const onLayout = (h: number) => {
    sheetH.value = h;
    if (!opened.current && h > 0) {
      opened.current = true;
      sheetP.value = withTiming(1, { duration: motion.duration.sheetOpen, easing: motion.easeOut });
      scrimP.value = withTiming(1, { duration: motion.duration.sheetScrim, easing: motion.easeOut });
    }
  };
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 560) }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  const pick = async (source: "camera" | "library") => {
    pressHaptic();
    setPickError(null);
    const result = await pickPhoto(source);
    if (result.ok) {
      // Null when the choice matches the gallery default: storing an override
      // equal to the default would light the lock chip on a photo that isn't
      // actually different.
      onPicked(result.photo, audience === galleryDefault ? null : audience);
      return;
    }
    if (result.reason === "cancelled") return;
    setPickError(result.message);
  };

  /** What actually happens to this photo, said plainly. */
  const note = ((): { text: string; warn: boolean } => {
    if (audience === "NONE") {
      return galleryDefault === "NONE"
        ? { text: "Only you. This photo stays private, like the rest of your gallery.", warn: false }
        : { text: "Only you — overrides your gallery default, for this photo only.", warn: false };
    }
    if (audience === "TRAINER") {
      if (!trainerConnected) {
        return {
          text: "You're not connected to a trainer — no one sees this photo until you connect one.",
          warn: true,
        };
      }
      return {
        text:
          galleryDefault === "TRAINER"
            ? "Your trainer will see photos you add. This is your Photos default."
            : "Your trainer will see this photo — an override for this photo only.",
        warn: false,
      };
    }
    if (!practitionerConnected) {
      return {
        text: "You're not connected to a practitioner — no one sees this photo until you connect one.",
        warn: true,
      };
    }
    return {
      text:
        galleryDefault === "PRACTITIONER"
          ? "Your practitioner will see photos you add. This is your Photos default."
          : "Your practitioner will see this photo — an override for this photo only.",
      warn: false,
    };
  })();

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 24 }, sheetStyle]}
        onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
      >
        <View style={styles.grabber} />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
          <Text style={styles.title}>Add a photo</Text>
          <Text style={styles.subtitle}>Encrypted and stored privately.</Text>

          <View style={styles.sources}>
            <SourceButton label="Take photo" onPress={() => void pick("camera")}>
              <Svg width={28} height={25} viewBox="0 0 28 25" fill="none">
                <Path d="M9.5 4V2.8A1.6 1.6 0 0 1 11.1 1.2h5.8A1.6 1.6 0 0 1 18.5 2.8V4" stroke={bio.alpha(0.75)} strokeWidth={1.6} strokeLinecap="round" />
                <Rect x={0.8} y={4} width={26.4} height={19.8} rx={5} stroke={bio.alpha(0.75)} strokeWidth={1.6} />
                <Circle cx={14} cy={13.9} r={4} stroke={bio.alpha(0.75)} strokeWidth={1.6} />
              </Svg>
            </SourceButton>
            <SourceButton label="From library" onPress={() => void pick("library")}>
              <Svg width={17} height={17} viewBox="0 0 17 17" fill="none">
                <Rect x={0} y={0} width={7} height={7} rx={2} fill={bio.alpha(0.75)} />
                <Rect x={10.4} y={0.7} width={5.6} height={5.6} rx={1.8} stroke={bio.alpha(0.75)} strokeWidth={1.4} />
                <Rect x={0.7} y={10.4} width={5.6} height={5.6} rx={1.8} stroke={bio.alpha(0.75)} strokeWidth={1.4} />
                <Rect x={10} y={10} width={7} height={7} rx={2} fill={bio.alpha(0.75)} />
              </Svg>
            </SourceButton>
          </View>

          {pickError ? <Text style={styles.pickError}>{pickError}</Text> : null}

          <View style={styles.guideRow}>
            <View style={styles.guideFrame}>
              <View style={styles.guideHead} />
              <View style={styles.guideBody} />
            </View>
            <View style={styles.guideText}>
              <Text style={styles.guideTitle}>Pose guide</Text>
              <Text style={styles.guideBodyText}>
                A faint outline of your last photo in the camera, so every shot lines up.
              </Text>
            </View>
            <Pressable
              onPress={() => {
                selectionHaptic();
                setGuide((g) => !g);
              }}
              style={[styles.track, guide && styles.trackOn]}
              accessibilityRole="switch"
              accessibilityLabel="Pose guide"
              accessibilityState={{ checked: guide }}
            >
              {guide ? (
                <LinearGradient
                  colors={[bio.color.violet, bio.color.violetDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <View style={[styles.knob, guide ? styles.knobOn : styles.knobOff]} />
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Who can see this photo</Text>
          <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Who can see this photo">
            {AUDIENCES.map((a) => {
              const on = audience === a.value;
              const isDefault = a.value === galleryDefault;
              return (
                <Pressable
                  key={a.value}
                  onPress={() => {
                    selectionHaptic();
                    setAudience(a.value);
                  }}
                  style={[styles.segCell, on && styles.segCellOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={isDefault ? `${a.label}, your gallery default` : a.label}
                >
                  <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>
                    {a.label}
                  </Text>
                  {isDefault ? <View style={styles.defaultDot} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.note, note.warn && styles.noteWarn]}>{note.text}</Text>
          <Text style={styles.footnote}>
            Your gallery default (·) comes from <Text style={styles.footnoteLink}>Who sees what</Text> → Photos.
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function SourceButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.source, pressed && styles.sourcePressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
      <Text style={styles.sourceLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(7,7,12,0.74)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    borderTopLeftRadius: bio.radius.sheet,
    borderTopRightRadius: bio.radius.sheet,
    backgroundColor: "#14131C",
    borderTopWidth: 1,
    borderTopColor: bio.alpha(0.14),
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  scroll: { flexGrow: 0 },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: bio.alpha(0.22), alignSelf: "center" },
  title: { fontFamily: fontFamily.bold, fontSize: 18, letterSpacing: -0.18, color: bio.color.text, marginTop: 16 },
  subtitle: { fontFamily: fontFamily.light, fontSize: 12, color: bio.alpha(0.55), marginTop: 4 },

  sources: { flexDirection: "row", gap: 10, marginTop: 16 },
  source: {
    flex: 1,
    height: 76,
    borderRadius: 16,
    backgroundColor: bio.alpha(0.06),
    borderWidth: 1,
    borderColor: bio.alpha(0.14),
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  sourcePressed: { transform: [{ scale: 0.97 }] },
  sourceLabel: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.color.text },
  pickError: { fontFamily: fontFamily.regular, fontSize: 11.5, lineHeight: 17, color: bio.color.coralLt2, marginTop: 10 },

  guideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  guideFrame: {
    width: 50,
    height: 68,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(196,176,247,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  guideHead: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(196,176,247,0.6)",
  },
  guideBody: {
    width: 24,
    height: 26,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(196,176,247,0.6)",
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 11,
    borderBottomRightRadius: 11,
  },
  guideText: { flex: 1, minWidth: 0 },
  guideTitle: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.text },
  guideBodyText: { fontFamily: fontFamily.light, fontSize: 11.5, lineHeight: 17, color: bio.alpha(0.55), marginTop: 3 },

  track: { width: 40, height: 24, borderRadius: 999, backgroundColor: bio.alpha(0.14), overflow: "hidden", justifyContent: "center" },
  trackOn: { backgroundColor: "transparent" },
  knob: { position: "absolute", width: 18, height: 18, borderRadius: 9, backgroundColor: bio.color.text },
  knobOff: { left: 3 },
  knobOn: { left: 19 },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.47,
    textTransform: "uppercase",
    color: bio.alpha(0.45),
    marginTop: 18,
  },
  segment: {
    flexDirection: "row",
    gap: 3,
    height: 44,
    borderRadius: 14,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    padding: 3,
    marginTop: 9,
  },
  segCell: {
    flex: 1,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "transparent",
  },
  segCellOn: { backgroundColor: bio.violetAlpha(0.17), borderColor: bio.violetAlpha(0.55) },
  segText: { fontFamily: fontFamily.semibold, fontSize: 11, color: bio.alpha(0.55) },
  segTextOn: { color: bio.color.violetChip },
  defaultDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: bio.color.violetChip },

  note: {
    fontFamily: fontFamily.light,
    fontSize: 11.5,
    lineHeight: 17,
    color: bio.alpha(0.6),
    marginTop: 10,
    minHeight: 34,
  },
  noteWarn: { color: "rgba(255,196,110,0.9)" },
  footnote: { fontFamily: fontFamily.light, fontSize: 10.5, color: bio.alpha(0.4), marginTop: 8 },
  footnoteLink: { fontFamily: fontFamily.semibold, color: bio.color.violetChip },
});
