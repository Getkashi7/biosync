/**
 * Your gym — what you booked, and when you were actually there. Built to A4.
 *
 * The two lists are kept apart on purpose. A booking is an intention; a visit
 * is a fact about a body being in a room, produced by a check-in or not at all.
 * Merging them into one "activity" feed would quietly upgrade the first into
 * the second, which is the claim the whole §6 attendance model refuses to make.
 *
 * So a booked class that was never checked into reads as Booked, not Attended,
 * however long ago it was — and a visit with no class says only where you were
 * rather than reaching for whatever happened to be running.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RadialBloom } from "../../ui/bio/RadialBloom";
import { FlatHeader } from "../../ui/bio/FlatHeader";
import { Spinner } from "../../ui/Spinner";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { classTime, dayHeading } from "../../lib/gymFormat";
import { fetchGymTimeline, fetchMyBookings, type Booking, type Visit } from "./gymApi";

type Data = { bookings: Booking[]; visits: Visit[] };

export function GymHistoryScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      // Both or neither: a screen showing visits with a silently missing
      // booking list would read as "you booked nothing", which is a claim.
      const [bookings, visits] = await Promise.all([fetchMyBookings(), fetchGymTimeline()]);
      setData({ bookings, visits });
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <RadialBloom
        color={bio.color.teal}
        size={bio.gym.bloom.size}
        left={bio.gym.bloom.left}
        top={bio.gym.bloom.top}
        alpha={bio.gym.bloom.alpha}
      />
      <View style={[styles.frame, { paddingTop: insets.top + 20 }]}>
        <FlatHeader title="Your gym" label="History" onBack={onBack} />

        {failed ? (
          <View style={styles.centre}>
            <Text style={styles.bigTitle}>Couldn't load your history</Text>
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
              accessibilityLabel="Try loading your history again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : data === null ? (
          <View style={styles.centre}>
            <Spinner tint={bio.color.teal} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.section}>BOOKINGS</Text>
            {data.bookings.length === 0 ? (
              <Text style={styles.none}>You haven't booked a class yet.</Text>
            ) : (
              data.bookings.map((b) => (
                <View key={b.classId} style={styles.row}>
                  <View style={styles.flexMin}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {b.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {dayHeading(b.startsAt)} · {classTime(b.startsAt)} · {b.venue}
                    </Text>
                    {b.cancelledReason ? (
                      <Text style={styles.cancelled} numberOfLines={2}>
                        Cancelled — {b.cancelledReason}
                      </Text>
                    ) : null}
                  </View>
                  {/* Attended is only ever written by a check-in. A booking
                      never checked into stays Booked, whatever the date. */}
                  <Text style={b.attended ? styles.tagOn : styles.tag}>
                    {b.attended ? "Attended" : "Booked"}
                  </Text>
                </View>
              ))
            )}

            <Text style={[styles.section, styles.sectionNext]}>VISITS</Text>
            {data.visits.length === 0 ? (
              <Text style={styles.none}>No check-ins in the last 30 days.</Text>
            ) : (
              data.visits.map((v) => (
                <View key={v.id} style={styles.row}>
                  <View style={styles.flexMin}>
                    {/* The venue leads, because that is what we actually know.
                        The class is an extra when one matched. */}
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {v.venue}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {dayHeading(v.at)} · {classTime(v.at)}
                      {v.klass ? ` · ${v.klass}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.source}>{v.source === "QR" ? "Scanned" : "Self"}</Text>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  frame: { flex: 1, paddingHorizontal: 20 },
  flexMin: { flex: 1, minWidth: 0 },
  pressed: { transform: [{ scale: 0.97 }] },

  section: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: bio.alpha(0.38),
    marginTop: 24,
    marginBottom: 4,
  },
  sectionNext: { marginTop: 28 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.07),
  },
  rowTitle: { fontFamily: fontFamily.semibold, fontSize: 15, color: bio.alpha(0.95) },
  rowMeta: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.alpha(0.45), marginTop: 3 },
  cancelled: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    color: bio.color.coral,
    marginTop: 4,
  },
  tag: { fontFamily: fontFamily.medium, fontSize: 12.5, color: bio.alpha(0.5) },
  tagOn: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.color.teal },
  source: { fontFamily: fontFamily.medium, fontSize: 12.5, color: bio.alpha(0.35) },

  none: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: bio.alpha(0.45),
    paddingVertical: 14,
    paddingHorizontal: 2,
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
});
