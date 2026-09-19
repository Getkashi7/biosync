/**
 * A coach's own directory profile (§6) — built to the A6 handoff.
 *
 * **Being verified and being listed are two different decisions, and this is
 * where the second one is made.** An admin granted the trainer capability
 * because they checked a credential; that is a permission, and it must never by
 * itself put someone's name and bio in a public directory. So a new profile is
 * private — the column defaults to unlisted and the server never sets it on
 * create — and appearing is a switch the coach flips themselves.
 *
 * **A bio cannot claim clinical work.** The server refuses one and names the
 * words it found, so a coach can rewrite rather than guess. A trainer is not a
 * clinician, and a bio is the easiest place in the app to imply otherwise — the
 * same reason the specialty list is a fixed catalogue rather than free text.
 *
 * Two notes on the handoff:
 *
 * The lede is *replaced* by the result line rather than pushed down by it. The
 * design is right about that — "this is what members see" is orientation copy
 * you need before you act and not after, and stacking both would push the first
 * field off the fold on a small phone.
 *
 * The design draws four states and no load failure. That omission is not
 * adopted: an unreachable server must never render as an empty form, or a coach
 * types a bio into a screen that will throw it away (CLAUDE.md, `LoadFailed`).
 */
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { RadialBloom } from "../../ui/bio/RadialBloom";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, pressHaptic, successHaptic } from "../../lib/haptics";
import {
  fetchMyCoachProfile,
  saveCoachProfile,
  setListed,
  type MyCoachProfile,
} from "./gymApi";

/**
 * Mirrors `COACH_SPECIALTIES` in `packages/shared/src/coaches.ts`.
 *
 * Duplicated because mobile cannot import shared (CLAUDE.md). The server
 * validates against its own copy, so a slug this build does not know is simply
 * not offered here rather than silently accepted.
 */
const SPECIALTIES: { slug: string; label: string }[] = [
  { slug: "strength", label: "Strength" },
  { slug: "conditioning", label: "Conditioning" },
  { slug: "mobility", label: "Mobility" },
  { slug: "running", label: "Running" },
  { slug: "post-natal", label: "Post-natal" },
  { slug: "older-adults", label: "Older adults" },
  { slug: "beginners", label: "Beginners" },
  { slug: "technique", label: "Technique" },
];

/** The server's caps, mirrored so the counter and the refusal agree. */
const BIO_MAX = 400;
const MAX_SPECIALTIES = 4;

export function CoachProfileScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<MyCoachProfile | null | undefined>(undefined);
  const [failed, setFailed] = useState<NetFailure | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bioText, setBioText] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [bookingUrl, setBookingUrl] = useState("");
  const [listed, setListedLocal] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const knob = useSharedValue(0);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value }] }));

  const load = useCallback(async () => {
    setFailed(null);
    try {
      const p = await fetchMyCoachProfile();
      setLoaded(p);
      if (p) {
        setDisplayName(p.displayName);
        setBioText(p.bio ?? "");
        setSpecialties([...p.specialties]);
        setBookingUrl(p.bookingUrl ?? "");
        setListedLocal(p.listed);
        knob.value = p.listed ? bio.gym.knobTravel : 0;
      }
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, [knob]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSpecialty = useCallback((slug: string) => {
    pressHaptic();
    setSaved(false);
    setSpecialties((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : // Capped rather than rejected: a directory entry claiming eight
          // specialities says less than one claiming two.
          prev.length >= MAX_SPECIALTIES
          ? prev
          : [...prev, slug],
    );
  }, []);

  const save = useCallback(async () => {
    if (busy) return;
    if (displayName.trim().length < 2) {
      setError("Your name needs at least two characters.");
      setSaved(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveCoachProfile({
        displayName: displayName.trim(),
        ...(bioText.trim() ? { bio: bioText.trim() } : {}),
        specialties,
        bookingUrl: bookingUrl.trim() || null,
      });
      successHaptic();
      setSaved(true);
      await load();
    } catch (e) {
      errorHaptic();
      setSaved(false);
      // The server's own message, because it names the reserved words it found
      // — which is the difference between rewriting and guessing.
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }, [bioText, bookingUrl, busy, displayName, load, specialties]);

  const changeListed = useCallback(async () => {
    if (busy || !loaded) return;
    const next = !listed;
    pressHaptic();
    setBusy(true);
    setError(null);
    // Moved before the round-trip and put back if it fails: a switch that waits
    // for the network feels broken at exactly the moment it is working.
    setListedLocal(next);
    knob.value = withTiming(next ? bio.gym.knobTravel : 0, { duration: 200 });
    try {
      await setListed(next);
      successHaptic();
    } catch (e) {
      errorHaptic();
      setListedLocal(!next);
      knob.value = withTiming(!next ? bio.gym.knobTravel : 0, { duration: 200 });
      setError(e instanceof Error ? e.message : "Couldn't change that.");
    } finally {
      setBusy(false);
    }
  }, [busy, knob, listed, loaded]);

  return (
    <View style={styles.root}>
      <RadialBloom
        color={bio.color.teal}
        size={bio.gym.bloom.size}
        left={bio.gym.bloom.left}
        top={bio.gym.bloom.top}
        alpha={bio.gym.bloom.alpha}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Header onBack={onBack} />

          {failed ? (
            <LoadFailed what="your coach profile" kind={failed} onRetry={() => void load()} />
          ) : loaded === undefined ? (
            <View style={styles.loading}>
              <Spinner tint={bio.color.tealLt} />
            </View>
          ) : (
            <>
              {/* One line in this slot, never two: the result replaces the
                  orientation copy rather than stacking under it. */}
              {error ? (
                <Text style={styles.error}>{error}</Text>
              ) : saved ? (
                <Text style={styles.saved}>Saved.</Text>
              ) : (
                <Text style={styles.lede}>
                  This is what members see in the coach directory. Nobody sees it until you
                  switch listing on.
                </Text>
              )}

              <Text style={[styles.fieldLabel, styles.fieldLabelFirst]}>NAME</Text>
              <TextInput
                value={displayName}
                onChangeText={(v) => {
                  setDisplayName(v);
                  setSaved(false);
                }}
                placeholder="How you want to be listed"
                placeholderTextColor={bio.alpha(0.3)}
                style={styles.input}
                autoCapitalize="words"
                selectionColor={bio.color.teal}
                accessibilityLabel="Display name"
              />

              <Text style={styles.fieldLabel}>ABOUT YOU</Text>
              <View style={styles.bioBox}>
                <TextInput
                  value={bioText}
                  onChangeText={(v) => {
                    // Capped here as well as on the server, so the counter can
                    // never show a number the save would reject.
                    if (v.length <= BIO_MAX) setBioText(v);
                    setSaved(false);
                  }}
                  placeholder="What you coach, and who you coach well"
                  placeholderTextColor={bio.alpha(0.3)}
                  style={styles.bioInput}
                  multiline
                  selectionColor={bio.color.teal}
                  accessibilityLabel="Bio"
                />
                <Text style={styles.counter}>
                  {bioText.length}/{BIO_MAX}
                </Text>
              </View>
              <Text style={styles.hint}>Keep to what you do. Claiming clinical work is refused.</Text>

              <Text style={styles.fieldLabel}>SPECIALTIES</Text>
              <View style={styles.chips}>
                {SPECIALTIES.map((s) => {
                  const on = specialties.includes(s.slug);
                  // Three chip states, and the handoff draws all three: chosen,
                  // still available, and unavailable because four are chosen.
                  const capped = !on && specialties.length >= MAX_SPECIALTIES;
                  return (
                    <Pressable
                      key={s.slug}
                      onPress={() => toggleSpecialty(s.slug)}
                      disabled={capped}
                      style={({ pressed }) => [
                        styles.chip,
                        on ? styles.chipOn : capped ? styles.chipCapped : styles.chipOff,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: capped }}
                      accessibilityLabel={s.label}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          on ? styles.chipTextOn : capped ? styles.chipTextCapped : null,
                        ]}
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>BOOKING LINK</Text>
              <TextInput
                value={bookingUrl}
                onChangeText={(v) => {
                  setBookingUrl(v);
                  setSaved(false);
                }}
                placeholder="cal.com/yourname"
                placeholderTextColor={bio.alpha(0.3)}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                selectionColor={bio.color.teal}
                accessibilityLabel="Booking link"
              />
              {/* The claim under a coach card is derived from this on the
                  server, so the sentence is true by construction. */}
              <Text style={styles.hint}>
                Members pay you directly — BIOSYNC takes nothing and handles no payment.
              </Text>

              <Pressable
                onPress={() => void save()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && styles.pressed,
                  busy && styles.btnOff,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save your profile"
                accessibilityState={{ disabled: busy }}
              >
                {busy ? (
                  <Spinner tint={bio.color.onTealSolid} />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </Pressable>

              <View style={styles.listRow}>
                <View style={styles.flexMin}>
                  <Text style={styles.listLabel}>List me in the directory</Text>
                  <Text style={styles.listHint}>
                    {loaded
                      ? "Until this is on, only you can see it."
                      : "Save your profile first — there's nothing to list yet."}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void changeListed()}
                  disabled={busy || !loaded}
                  style={[
                    styles.track,
                    listed ? styles.trackOn : styles.trackOff,
                    !loaded && styles.btnOff,
                  ]}
                  accessibilityRole="switch"
                  accessibilityLabel="List me in the coach directory"
                  accessibilityState={{ checked: listed, disabled: busy || !loaded }}
                >
                  <Animated.View style={[styles.knob, knobStyle]} />
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The gym bundle's header: a bare chevron, the title, and the section label on
 * the same line.
 *
 * Deliberately not `ui/bio/ScreenHeader`, which puts a 21px title over the
 * label inside a 36px glass circle button. Seven screens already depend on that
 * treatment and their own designs specify it, so changing it to suit this
 * handoff would restyle all of them. Local for now; extract the moment a second
 * gym screen lands on it (A1–A5 all appear to share it).
 */
function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => {
          pressHaptic();
          onBack();
        }}
        hitSlop={12}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
          <Path
            d="M7 1L1.6 7L7 13"
            stroke={bio.alpha(0.62)}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      <Text style={styles.headerTitle}>Your profile</Text>
      <Text style={styles.headerLabel}>COACH</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  flex: { flex: 1 },
  flexMin: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 18 },
  pressed: { transform: [{ scale: 0.97 }] },

  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerTitle: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: bio.alpha(0.98),
  },
  headerLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: bio.alpha(0.38),
  },

  lede: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: bio.alpha(0.55),
    marginTop: 12,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19.5,
    color: bio.color.coral,
    marginTop: 14,
  },
  saved: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: bio.color.teal,
    marginTop: 14,
  },

  fieldLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: bio.alpha(0.38),
    marginTop: 14,
  },
  // The first label sits slightly further from a one-line result than from the
  // three-line lede, which is what the handoff draws.
  fieldLabelFirst: { marginTop: 16 },

  input: {
    marginTop: 7,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.08),
    borderRadius: bio.gym.input.radius,
    paddingVertical: bio.gym.input.padV,
    paddingHorizontal: bio.gym.input.padH,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: bio.alpha(0.94),
  },

  bioBox: {
    marginTop: 7,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.08),
    borderRadius: bio.gym.input.radius,
    paddingTop: bio.gym.input.padV,
    paddingHorizontal: bio.gym.input.padH,
    // Room for the counter, which sits inside the box rather than under it.
    paddingBottom: 24,
  },
  bioInput: {
    fontFamily: fontFamily.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: bio.alpha(0.9),
    padding: 0,
    minHeight: 60,
    textAlignVertical: "top",
  },
  counter: {
    position: "absolute",
    bottom: 7,
    right: 12,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: bio.alpha(0.35),
    fontVariant: ["tabular-nums"],
  },

  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: bio.alpha(0.35),
    marginTop: 6,
  },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  chip: {
    paddingVertical: bio.gym.chip.padV,
    paddingHorizontal: bio.gym.chip.padH,
    borderRadius: bio.gym.chip.radius,
    borderWidth: 1,
  },
  chipOn: { backgroundColor: bio.tealAlpha(0.12), borderColor: bio.tealAlpha(0.38) },
  chipOff: { borderColor: bio.alpha(0.13) },
  chipCapped: { borderColor: bio.alpha(0.08) },
  chipText: { fontFamily: fontFamily.medium, fontSize: 12, color: bio.alpha(0.55) },
  chipTextOn: { fontFamily: fontFamily.semibold, color: bio.color.teal },
  chipTextCapped: { color: bio.alpha(0.35) },

  saveBtn: {
    marginTop: 16,
    height: bio.gym.cta.height,
    borderRadius: bio.gym.cta.radius,
    backgroundColor: bio.color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: bio.color.onTealSolid,
  },
  btnOff: { opacity: 0.5 },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: bio.color.hairline,
  },
  listLabel: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.alpha(0.92) },
  listHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    color: bio.alpha(0.35),
    marginTop: 3,
  },
  track: {
    width: bio.gym.track.width,
    height: bio.gym.track.height,
    borderRadius: bio.gym.track.radius,
    padding: bio.gym.track.pad,
    justifyContent: "center",
  },
  trackOn: { backgroundColor: bio.color.teal },
  trackOff: { backgroundColor: bio.alpha(0.12) },
  knob: {
    width: bio.gym.knob,
    height: bio.gym.knob,
    borderRadius: bio.gym.knob,
    backgroundColor: bio.color.knob,
  },

  loading: { paddingVertical: 240, alignItems: "center" },
});
