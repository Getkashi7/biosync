/**
 * Check in — "I'm here."
 *
 * **This is the manual path, and manual is all this build can do.** Scanning
 * the venue's rotating QR needs `expo-camera`, a native module, and adding one
 * forces a new dev-client APK before anything works on the device at all. The
 * server already has `gym.checkInScan` and its HMAC verification; the camera is
 * the only missing piece, and it should ride along with the next native build
 * (push notifications need one too). Until then this records `MANUAL`, which
 * the API keeps deliberately distinct from `QR` — a self-declared visit is a
 * different quality of evidence, and collapsing the two would quietly turn an
 * honest "they said they were there" into "the venue confirmed it".
 *
 * The screen also never claims a second visit. `alreadyCheckedIn` comes back
 * true when a visit inside the dedupe window already existed, and the copy says
 * so — somebody tapping twice because they weren't sure it worked has not been
 * to the gym twice.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { SuccessCheck } from "../../ui/SuccessCheck";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, pressHaptic, successHaptic } from "../../lib/haptics";
import { checkInManual, fetchVenues, type CheckInResult, type Venue } from "./gymApi";

export function CheckInScreen({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setVenues(await fetchVenues());
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const check = useCallback(
    async (venue: Venue) => {
      if (busyId) return;
      setBusyId(venue.id);
      setError(null);
      try {
        const res = await checkInManual(venue.id);
        setResult(res);
        successHaptic();
      } catch (e) {
        errorHaptic();
        setError(e instanceof Error ? e.message : "That didn't go through.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  if (result) {
    return (
      <View style={styles.root}>
        <StaticBloom color={bio.color.teal} />
        <View style={[styles.done, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 32 }]}>
          <SuccessCheck />
          <Text style={styles.doneTitle}>
            {result.alreadyCheckedIn ? "Already checked in" : "Checked in"}
          </Text>
          <Text style={styles.doneBody}>
            {result.alreadyCheckedIn
              ? `We already have you at ${result.venue} — this didn't add a second visit.`
              : result.matchedClass
                ? `${result.venue} · counted towards ${result.matchedClass}.`
                : /* No class is the common, correct answer. The visit is real
                     and names the venue rather than inventing a class. */
                  `${result.venue}. No class booked right now, so this is recorded as a visit.`}
          </Text>
          <Pressable
            onPress={() => {
              pressHaptic();
              onDone();
            }}
            style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StaticBloom color={bio.color.teal} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Check in" label="Gym" onBack={onBack} />
        <Text style={styles.lede}>Where are you?</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {failed ? (
          <LoadFailed what="the venue list" kind={failed} onRetry={() => void load()} />
        ) : venues === null ? (
          <View style={styles.loading}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : venues.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No venues yet</Text>
            <Text style={styles.emptyBody}>
              Nowhere has been set up to check in at. An admin adds venues.
            </Text>
          </View>
        ) : (
          venues.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => {
                pressHaptic();
                void check(v);
              }}
              disabled={busyId !== null}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.pressed,
                busyId !== null && busyId !== v.id && styles.rowOff,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Check in at ${v.name}`}
              accessibilityState={{ disabled: busyId !== null }}
            >
              <View style={styles.flexMin}>
                <Text style={styles.venue} numberOfLines={1}>
                  {v.name}
                </Text>
                {v.address ? (
                  <Text style={styles.address} numberOfLines={1}>
                    {v.address}
                  </Text>
                ) : null}
              </View>
              {busyId === v.id ? (
                <Spinner tint={bio.color.tealLt} />
              ) : (
                <Text style={styles.go}>Check in</Text>
              )}
            </Pressable>
          ))
        )}

        <Text style={styles.footnote}>
          Recorded as a self check-in. Scanning the code on the wall arrives with
          the next app update.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  content: { paddingHorizontal: 20 },
  flexMin: { flex: 1, minWidth: 0 },

  lede: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: bio.alpha(0.55),
    marginTop: 12,
    marginBottom: 18,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.sm,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
  },
  rowOff: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.97 }] },
  venue: { fontFamily: fontFamily.semibold, fontSize: 16, color: bio.color.text },
  address: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.45), marginTop: 2 },
  go: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.tealLt },

  error: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.coralLt, marginBottom: 12 },
  loading: { paddingVertical: 48, alignItems: "center" },
  empty: { paddingVertical: 32 },
  emptyTitle: { fontFamily: fontFamily.semibold, fontSize: 16, color: bio.color.text },
  emptyBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: bio.alpha(0.5),
    marginTop: 6,
    lineHeight: 20,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: bio.alpha(0.35),
    marginTop: 24,
    lineHeight: 18,
  },

  done: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  doneTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 24,
    color: bio.color.text,
    marginTop: 28,
    textAlign: "center",
  },
  doneBody: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: bio.alpha(0.55),
    marginTop: 10,
    textAlign: "center",
    lineHeight: 22,
  },
  doneBtn: {
    marginTop: 36,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.color.tealDeep,
  },
  doneBtnText: { fontFamily: fontFamily.semibold, fontSize: 15, color: bio.color.onTeal },
});
