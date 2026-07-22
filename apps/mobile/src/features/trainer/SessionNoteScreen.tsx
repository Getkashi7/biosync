/**
 * Session note composer (design 4A).
 *
 * The shared-with-client toggle is the whole point of this screen, so its copy
 * changes live and says plainly who will be able to read the note — a trainer
 * should never be unsure whether they're writing in front of the client. The
 * server enforces it too: `training.myNotes` only ever returns shared notes.
 */
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { bio, fontFamily, motion } from "../../ui/theme";
import { pressHaptic, selectionHaptic, successHaptic } from "../../lib/haptics";
import { dateLabel, initials, monthShort } from "../../lib/format";
import { addNote } from "./trainerApi";



/** first name, for the toggle's copy */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function SessionNoteScreen({
  clientId,
  clientName,
  onBack,
  onSaved,
}: {
  clientId: string;
  clientName: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [shared, setShared] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knob = useSharedValue(1);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value * 18 }] }));

  const toggle = useCallback(() => {
    selectionHaptic();
    setShared((prev) => {
      const next = !prev;
      knob.value = withTiming(next ? 1 : 0, { duration: 200, easing: motion.easeOut });
      return next;
    });
  }, [knob]);

  const save = useCallback(async () => {
    const body = text.trim();
    if (!body || saving) return;
    pressHaptic();
    setSaving(true);
    setError(null);
    try {
      await addNote(clientId, body, shared);
      successHaptic();
      onSaved();
    } catch {
      setError("Couldn’t save that note — try again.");
      setSaving(false);
    }
  }, [text, saving, clientId, shared, onSaved]);

  const now = new Date();
  const canSave = text.trim().length > 0 && !saving;

  return (
    <View style={styles.root}>
      <StaticBloom />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.inner, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Pressable
              onPress={() => {
                pressHaptic();
                onBack();
              }}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                <Path d="M1 1 L11 11 M11 1 L1 11" stroke={bio.alpha(0.8)} strokeWidth={1.7} strokeLinecap="round" />
              </Svg>
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.title}>Session note</Text>
              <Text style={styles.subtitle}>NEW NOTE</Text>
            </View>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.clientCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(clientName)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.clientName} numberOfLines={1}>
                {clientName}
              </Text>
              <Text style={styles.clientMeta}>{dateLabel(now)}</Text>
            </View>
            <View style={styles.dateBlock}>
              <Text style={styles.dateText}>
                {String(now.getDate()).padStart(2, "0")} {monthShort(now).toUpperCase()}
              </Text>
              <Text style={styles.dateToday}>Today</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>NOTE</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a note about this session…"
            placeholderTextColor={bio.alpha(0.38)}
            style={styles.textarea}
            multiline
            editable={!saving}
            selectionColor={bio.color.teal}
          />

          <Pressable onPress={toggle} style={styles.shareCard} accessibilityRole="switch" accessibilityState={{ checked: shared }}>
            <View style={styles.shareIcon}>
              <Svg width={18} height={14} viewBox="0 0 18 14" fill="none">
                <Circle cx={4} cy={3.5} r={2.6} fill={bio.color.teal} />
                <Path d="M0.5 13 C0.5 10.2 2 8.8 4 8.8 C6 8.8 7.5 10.2 7.5 13 Z" fill={bio.color.teal} />
                <Circle cx={13.5} cy={4} r={2.3} fill={bio.tealAlpha(0.6)} />
                <Path d="M10.5 13 C10.5 10.6 11.8 9.4 13.5 9.4 C15.2 9.4 16.5 10.6 16.5 13 Z" fill={bio.tealAlpha(0.6)} />
              </Svg>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.shareTitle, { color: shared ? bio.color.teal : bio.alpha(0.75) }]}>
                {shared ? "Shared with client" : "Private to you"}
              </Text>
              <Text style={styles.shareSub}>
                {shared ? `${firstName(clientName)} can read this note in their app.` : "Only you can see this note."}
              </Text>
            </View>
            <View style={[styles.track, !shared && styles.trackOff]}>
              {shared ? (
                <LinearGradient
                  colors={[bio.color.teal, bio.color.tealDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <Animated.View style={[styles.knob, knobStyle]} />
            </View>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <Pressable
            onPress={() => void save()}
            disabled={!canSave}
            style={({ pressed }) => [styles.cta, !canSave && styles.ctaDim, pressed && styles.ctaPressed]}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[bio.color.teal, bio.color.tealDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaFill}
            >
              <Text style={styles.ctaText}>{saving ? "Saving…" : "Save note"}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20 },
  // the header stays fixed; this holds the scrollable form above the pinned CTA
  formContent: { paddingBottom: 12 },

  header: { flexDirection: "row", alignItems: "center", gap: 13 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.06),
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fontFamily.bold, fontSize: 21, letterSpacing: -0.21, color: bio.color.text },
  subtitle: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 1.47, color: bio.alpha(0.45), marginTop: 3 },

  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: bio.radius.sm,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.07),
    borderWidth: 1,
    borderColor: bio.alpha(0.13),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.alpha(0.85) },
  clientName: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.text },
  clientMeta: { fontFamily: fontFamily.light, fontSize: 11, color: bio.alpha(0.45), marginTop: 1 },
  dateBlock: { alignItems: "flex-end" },
  dateText: { fontFamily: fontFamily.dotBold, fontSize: 15, lineHeight: 16, color: bio.alpha(0.8) },
  dateToday: { fontFamily: fontFamily.medium, fontSize: 10, color: bio.alpha(0.4), marginTop: 3 },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 20,
    marginBottom: 9,
  },
  textarea: {
    // a fixed height inside the ScrollView (flex:1 has no bounded height there);
    // the field grows with text and the page scrolls past it
    minHeight: 200,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.11),
    padding: 16,
    fontFamily: fontFamily.light,
    fontSize: 14,
    lineHeight: 22,
    color: bio.color.text,
    textAlignVertical: "top",
  },

  shareCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: bio.radius.sm,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  shareIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: bio.tealAlpha(0.1),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.26),
    alignItems: "center",
    justifyContent: "center",
  },
  shareTitle: { fontFamily: fontFamily.semibold, fontSize: 14 },
  shareSub: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.5), marginTop: 2 },
  track: {
    width: 46,
    height: 28,
    borderRadius: 999,
    padding: 3,
    justifyContent: "center",
    overflow: "hidden",
  },
  trackOff: { backgroundColor: bio.alpha(0.14) },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: bio.color.knob },

  error: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.alpha(0.6), marginTop: 12 },

  cta: { height: 54, borderRadius: 16, overflow: "hidden", marginTop: 14 },
  ctaFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  ctaDim: { opacity: 0.45 },
  ctaPressed: { transform: [{ scale: 0.985 }] },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 15, color: bio.color.onTeal },

  pressed: { opacity: 0.85, transform: [{ scale: 0.94 }] },
});
