/**
 * Your gym history — what you booked, and when you were actually there.
 *
 * The two lists are kept apart on purpose. A booking is an intention; a visit
 * is a fact about a body being in a room, produced by a check-in or not at all.
 * Merging them into one "activity" feed would quietly upgrade the first into
 * the second, which is the claim the whole §6 attendance model refuses to make.
 *
 * So a booked class that was never checked into shows as booked, not attended,
 * however long ago it was — and a visit with no class says so rather than
 * reaching for whatever was running at the time.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
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
      <StaticBloom color={bio.color.teal} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Your gym" label="History" onBack={onBack} />

        {failed ? (
          <LoadFailed what="your gym history" kind={failed} onRetry={() => void load()} />
        ) : data === null ? (
          <View style={styles.loading}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : (
          <>
            <Text style={styles.section}>BOOKINGS</Text>
            {data.bookings.length === 0 ? (
              <Text style={styles.none}>You haven't booked a class yet.</Text>
            ) : (
              data.bookings.map((b) => (
                <View key={b.classId} style={styles.row}>
                  <View style={styles.flexMin}>
                    <Text style={styles.title} numberOfLines={1}>
                      {b.title}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {dayHeading(b.startsAt)} · {classTime(b.startsAt)} · {b.venue}
                    </Text>
                    {b.cancelledReason ? (
                      <Text style={styles.cancelled} numberOfLines={2}>
                        Cancelled — {b.cancelledReason}
                      </Text>
                    ) : null}
                  </View>
                  {/* "Attended" is only ever set by a check-in. A booking that
                      was never checked into stays "Booked", whatever the date. */}
                  <Text style={[styles.tag, b.attended && styles.tagOn]}>
                    {b.attended ? "Attended" : "Booked"}
                  </Text>
                </View>
              ))
            )}

            <Text style={[styles.section, styles.sectionGap]}>VISITS</Text>
            {data.visits.length === 0 ? (
              <Text style={styles.none}>No check-ins in the last 30 days.</Text>
            ) : (
              data.visits.map((v) => (
                <View key={v.id} style={styles.row}>
                  <View style={styles.flexMin}>
                    <Text style={styles.title} numberOfLines={1}>
                      {/* The venue leads, because that is what we actually
                          know. The class is an extra when one matched. */}
                      {v.venue}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {dayHeading(v.at)} · {classTime(v.at)}
                      {v.klass ? ` · ${v.klass}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.source}>{v.source === "QR" ? "Scanned" : "Self"}</Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  content: { paddingHorizontal: 20 },
  flexMin: { flex: 1, minWidth: 0 },

  section: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: bio.alpha(0.42),
    marginTop: 20,
    marginBottom: 10,
  },
  sectionGap: { marginTop: 30 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: bio.color.hairline,
  },
  title: { fontFamily: fontFamily.medium, fontSize: 15, color: bio.color.text },
  meta: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.45), marginTop: 3 },
  cancelled: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: bio.color.coralLt,
    marginTop: 4,
  },
  tag: { fontFamily: fontFamily.medium, fontSize: 12, color: bio.alpha(0.45) },
  tagOn: { color: bio.color.tealLt },
  source: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.35) },

  none: { fontFamily: fontFamily.regular, fontSize: 14, color: bio.alpha(0.45), paddingVertical: 8 },
  loading: { paddingVertical: 48, alignItems: "center" },
});
