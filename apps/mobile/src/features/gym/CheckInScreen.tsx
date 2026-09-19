/**
 * Check in — "I'm here." Built to the A2 handoff.
 *
 * **This is the manual path, and manual is all this build can do.** Scanning
 * the venue's rotating QR needs `expo-camera`, a native module, and adding one
 * forces a new dev-client APK before anything works on the device at all. The
 * server already has `gym.checkInScan` and its HMAC verification; the camera is
 * the only missing piece, and it should ride along with the next native build.
 * Until then this records `MANUAL`, which the API keeps deliberately distinct
 * from `QR` — a self-declared visit is a different quality of evidence, and
 * collapsing the two would quietly turn "they said they were there" into "the
 * venue confirmed it". The footnote says so rather than letting the distinction
 * live only in the database.
 *
 * The screen never claims a second visit. Inside the dedupe window the server
 * returns the FIRST visit and its original time, and the copy reports that time
 * — "your 06:54 check-in still stands" is only true if it says 06:54.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { RadialBloom } from "../../ui/bio/RadialBloom";
import { FlatHeader } from "../../ui/bio/FlatHeader";
import { Spinner } from "../../ui/Spinner";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { classTime } from "../../lib/gymFormat";
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
        setResult(await checkInManual(venue.id));
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

  /* ---------------------------------------------------------------- */

  if (result) {
    const at = classTime(result.at);
    return (
      <View style={styles.root}>
        <Bloom />
        <View style={[styles.frame, { paddingTop: insets.top + 20 }]}>
          <FlatHeader title="Check in" label="Gym" onBack={onBack} />
          <View style={styles.centre}>
            <Tick />
            <Text style={styles.doneTitle}>
              {result.alreadyCheckedIn ? "Already checked in" : "Checked in"}
            </Text>
            <Text style={styles.doneBody}>
              {result.alreadyCheckedIn
                ? `Your ${at} check-in at ${result.venue} still stands.`
                : result.matchedClass
                  ? // A matched class is real information the server computed,
                    // so it is said rather than dropped to keep one sentence.
                    `Counted towards ${result.matchedClass} at ${result.venue}, ${at}.`
                  : `Recorded as a visit at ${result.venue}, ${at}.`}
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
      </View>
    );
  }

  /* ---------------------------------------------------------------- */

  return (
    <View style={styles.root}>
      <Bloom />
      <View
        style={[
          styles.frame,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <FlatHeader title="Check in" label="Gym" onBack={onBack} />

        {failed ? (
          <View style={styles.centre}>
            <Text style={styles.bigTitle}>Couldn't load venues</Text>
            {/* Kept against the handoff, as on A1: offline and "our end broke"
                are different claims and only one of them is true. */}
            <Text style={styles.bigBody}>
              {failed === "offline"
                ? "You look offline. Check your connection — nothing has been lost."
                : "Something went wrong on our end. Nothing has been lost."}
            </Text>
            <Pressable
              onPress={() => {
                pressHaptic();
                void load();
              }}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Try loading venues again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : venues === null ? (
          <View style={styles.centre}>
            <Spinner tint={bio.color.teal} />
          </View>
        ) : venues.length === 0 ? (
          <View style={styles.centre}>
            <Text style={styles.bigTitle}>No venues yet</Text>
          </View>
        ) : (
          <>
            <Text style={styles.lede}>Where are you?</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
              {venues.map((v) => (
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
                    // The row being checked in stays lit; the others dim, so
                    // the spinner reads as "this one".
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
                    <Spinner sizePx={16} tint={bio.color.teal} />
                  ) : (
                    <Text style={styles.go}>Check in</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.footnote}>
              Recorded as a self check-in. Scanning the code on the wall arrives with the
              next app update.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function Bloom() {
  return (
    <RadialBloom
      color={bio.color.teal}
      size={bio.gym.bloom.size}
      left={bio.gym.bloom.left}
      top={bio.gym.bloom.top}
      alpha={bio.gym.bloom.alpha}
    />
  );
}

/** The handoff's confirmation mark: a hairline ring with a teal check. */
function Tick() {
  return (
    <Svg width={54} height={54} viewBox="0 0 54 54" fill="none">
      <Circle cx={27} cy={27} r={26} stroke={bio.tealAlpha(0.35)} strokeWidth={1.5} />
      <Path
        d="M17 27.5l7 7 13-14"
        stroke={bio.color.teal}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  frame: { flex: 1, paddingHorizontal: 20 },
  flexMin: { flex: 1, minWidth: 0 },
  pressed: { transform: [{ scale: 0.97 }] },

  lede: { fontFamily: fontFamily.regular, fontSize: 15, color: bio.alpha(0.7), marginTop: 16 },
  error: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.coral, marginTop: 10 },

  list: { marginTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.07),
  },
  rowOff: { opacity: 0.4 },
  venue: { fontFamily: fontFamily.semibold, fontSize: 15, color: bio.alpha(0.95) },
  address: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.alpha(0.45), marginTop: 3 },
  go: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.teal },

  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18.6,
    color: bio.alpha(0.35),
    paddingTop: 16,
  },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  bigTitle: { fontFamily: fontFamily.semibold, fontSize: 16.5, color: bio.alpha(0.9) },
  bigBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19.5,
    color: bio.alpha(0.45),
    marginTop: 8,
    textAlign: "center",
  },
  retry: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.42),
  },
  retryText: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.teal },

  doneTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    color: bio.alpha(0.97),
    marginTop: 22,
    textAlign: "center",
  },
  doneBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: bio.alpha(0.55),
    marginTop: 10,
    textAlign: "center",
  },
  doneBtn: {
    marginTop: 30,
    paddingVertical: 12,
    paddingHorizontal: 38,
    borderRadius: 999,
    backgroundColor: bio.color.teal,
  },
  doneBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: bio.color.onTealSolid,
  },
});
