/**
 * Classes (§6) — the schedule, and taking a seat.
 *
 * Teal register: this is a training surface, not a clinical one, and the colour
 * is what keeps that legible next to §7's blue.
 *
 * Three things this screen refuses to do.
 *
 * **It never decides whether a class is bookable.** `state` arrives computed by
 * the server, and the Book button keys off that alone. Working it out again
 * here from `seatsLeft` and the clock would produce a second answer that
 * disagrees with the one the write is actually checked against — which is how
 * you get a button that looks available and fails.
 *
 * **It never shows an empty state for a failed request.** "No classes this
 * week" and "we couldn't reach the server" are different claims, and only one
 * of them is true when the fetch threw.
 *
 * **It never claims a booking it does not have.** After a booking or a
 * cancellation the schedule is re-read rather than patched locally: the seat
 * was claimed by a conditional update on the server, and the server is the only
 * thing that knows whether it succeeded.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, pressHaptic, successHaptic } from "../../lib/haptics";
import { classRange, groupByDay, seatsLabel, unbookableReason } from "../../lib/gymFormat";
import {
  bookClass,
  cancelBooking,
  fetchSchedule,
  fetchVenues,
  type GymClass,
  type Venue,
} from "./gymApi";

/** A week is the window people plan in, and the server's cap is fourteen days. */
const DAYS = 7;

export function GymScreen({
  onBack,
  onCoaches,
  onCheckIn,
  onHistory,
}: {
  onBack: () => void;
  onCoaches: () => void;
  onCheckIn: () => void;
  onHistory: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [classes, setClasses] = useState<GymClass[] | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  /** Which class is mid-write, so only its own button shows the wait. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      const rows = await fetchSchedule(undefined, DAYS, venueId ?? undefined);
      setClasses(rows);
    } catch (e) {
      // Left as null rather than [] — an empty list here would say "no classes"
      // about a request that never arrived.
      setFailed(classifyNetError(e));
    }
  }, [venueId]);

  useEffect(() => {
    void (async () => {
      try {
        setVenues(await fetchVenues());
      } catch {
        // A venue filter is a convenience; losing it must not take the
        // schedule down with it, so this failure is deliberately quiet.
      }
    })();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (c: GymClass) => {
      if (busyId) return;
      setBusyId(c.id);
      setNotice(null);
      const booking = c.yourBooking;
      try {
        if (booking === "BOOKED") await cancelBooking(c.id);
        else await bookClass(c.id);
        successHaptic();
      } catch (e) {
        errorHaptic();
        // The server's own message, because it distinguishes cases this screen
        // deliberately does not model: full, cancelled, already started,
        // already booked on another device.
        setNotice(e instanceof Error ? e.message : "That didn't go through.");
      } finally {
        setBusyId(null);
        // Re-read either way. A failed booking may still have changed what is
        // true — somebody else took the seat — and a stale card would invite
        // the same tap again.
        await load();
      }
    },
    [busyId, load],
  );

  const days = useMemo(() => groupByDay(classes ?? []), [classes]);

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
        <ScreenHeader title="Classes" label="Gym" onBack={onBack} />

        <View style={styles.actions}>
          <ActionTile label="Check in" hint="You're here" onPress={onCheckIn} />
          <ActionTile label="Coaches" hint="Find a trainer" onPress={onCoaches} />
          <ActionTile label="History" hint="Your visits" onPress={onHistory} />
        </View>

        {venues.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip label="All venues" on={venueId === null} onPress={() => setVenueId(null)} />
            {venues.map((v) => (
              <Chip
                key={v.id}
                label={v.name}
                on={venueId === v.id}
                onPress={() => setVenueId(v.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {failed ? (
          <LoadFailed what="the schedule" kind={failed} onRetry={() => void load()} />
        ) : classes === null ? (
          <View style={styles.loading}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : classes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing scheduled</Text>
            <Text style={styles.emptyBody}>
              {venueId
                ? "No classes at this venue in the next week. Try All venues."
                : "There are no classes in the next week yet."}
            </Text>
          </View>
        ) : (
          days.map((day) => (
            <View key={day.heading}>
              <Text style={styles.dayHeading}>{day.heading.toUpperCase()}</Text>
              {day.rows.map((c) => (
                <ClassCard
                  key={c.id}
                  cls={c}
                  busy={busyId === c.id}
                  disabled={busyId !== null && busyId !== c.id}
                  onAct={() => void act(c)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ClassCard({
  cls,
  busy,
  disabled,
  onAct,
}: {
  cls: GymClass;
  busy: boolean;
  disabled: boolean;
  onAct: () => void;
}) {
  const booked = cls.yourBooking === "BOOKED";
  const attended = cls.yourBooking === "ATTENDED";
  const reason = unbookableReason(cls.state);
  const seats = seatsLabel(cls.seatsLeft);
  // Cancelling is allowed right up to the start, so a booked seat on a class
  // that is merely FULL still shows its button — "full" is not a reason you
  // cannot leave.
  const canAct = booked ? cls.state !== "PAST" && cls.state !== "IN_PROGRESS" : reason === null;

  return (
    <View style={[styles.card, cls.state === "CANCELLED" && styles.cardOff]}>
      <View style={styles.cardTop}>
        <Text style={styles.time}>{classRange(cls.startsAt, cls.durationMin)}</Text>
        {booked ? (
          <View style={styles.bookedChip}>
            <Text style={styles.bookedChipText}>BOOKED</Text>
          </View>
        ) : attended ? (
          <View style={styles.attendedChip}>
            <Text style={styles.attendedChipText}>ATTENDED</Text>
          </View>
        ) : seats ? (
          <Text style={[styles.seats, cls.seatsLeft === 0 && styles.seatsFull]}>{seats}</Text>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {cls.title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {cls.venue.name}
        {cls.coach ? ` · ${cls.coach}` : ""}
      </Text>

      {cls.state === "CANCELLED" ? (
        <Text style={styles.cancelled}>
          {/* Why, not just that. A cancellation with no reason is a
              notification rather than an explanation. */}
          Cancelled{cls.cancelReason ? ` — ${cls.cancelReason}` : ""}
        </Text>
      ) : null}

      <View style={styles.cardBottom}>
        {canAct ? (
          <Pressable
            onPress={() => {
              pressHaptic();
              onAct();
            }}
            disabled={busy || disabled}
            style={({ pressed }) => [
              booked ? styles.cancelBtn : styles.bookBtn,
              pressed && styles.pressed,
              (busy || disabled) && styles.btnOff,
            ]}
            accessibilityRole="button"
            accessibilityLabel={booked ? `Cancel your place on ${cls.title}` : `Book ${cls.title}`}
            accessibilityState={{ disabled: busy || disabled }}
          >
            <Text style={booked ? styles.cancelBtnText : styles.bookBtnText}>
              {busy ? "…" : booked ? "Cancel" : "Book"}
            </Text>
          </Pressable>
        ) : reason && !booked && !attended ? (
          // No button at all, and the reason in its place. A disabled control
          // that can only fail is worse than no control.
          <Text style={styles.reason}>{reason}</Text>
        ) : null}
      </View>
    </View>
  );
}

function ActionTile({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        pressHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label} — ${hint}`}
    >
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileHint} numberOfLines={1}>
        {hint}
      </Text>
    </Pressable>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        pressHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  content: { paddingHorizontal: 20 },

  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  tile: {
    flex: 1,
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.sm,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tileLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: bio.color.text,
  },
  tileHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: bio.alpha(0.45),
    marginTop: 2,
  },

  chips: { gap: 8, paddingVertical: 14, paddingRight: 20 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    backgroundColor: bio.color.surface,
  },
  chipOn: { borderColor: bio.tealAlpha(0.55), backgroundColor: bio.tealAlpha(0.12) },
  chipText: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.6) },
  chipTextOn: { color: bio.color.tealLt },

  dayHeading: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: bio.alpha(0.42),
    marginTop: 22,
    marginBottom: 10,
  },

  card: {
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.card,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    padding: 16,
    marginBottom: 10,
  },
  cardOff: { opacity: 0.6 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  time: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.tealLt },
  seats: { fontFamily: fontFamily.medium, fontSize: 12, color: bio.color.amber },
  seatsFull: { color: bio.alpha(0.45) },
  bookedChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.tealAlpha(0.16),
  },
  bookedChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: bio.color.tealLt,
  },
  attendedChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.07),
  },
  attendedChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: bio.alpha(0.5),
  },

  title: { fontFamily: fontFamily.semibold, fontSize: 17, color: bio.color.text, marginTop: 8 },
  meta: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.5), marginTop: 3 },
  cancelled: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.color.coralLt, marginTop: 8 },

  cardBottom: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  bookBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.color.tealDeep,
  },
  bookBtnText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.onTeal },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
  },
  cancelBtnText: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.alpha(0.7) },
  btnOff: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.97 }] },
  reason: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.42) },

  notice: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: bio.color.coralLt,
    marginTop: 14,
  },
  loading: { paddingVertical: 48, alignItems: "center" },
  empty: { paddingVertical: 40 },
  emptyTitle: { fontFamily: fontFamily.semibold, fontSize: 16, color: bio.color.text },
  emptyBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: bio.alpha(0.5),
    marginTop: 6,
    lineHeight: 20,
  },
});
