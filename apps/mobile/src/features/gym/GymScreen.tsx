/**
 * Classes (§6) — the schedule, and taking a seat. Built to the A1 handoff.
 *
 * Three things this screen refuses to do.
 *
 * **It never decides whether a class is bookable.** `state` arrives computed by
 * the server and the Book button keys off that alone. Working it out again here
 * from `seatsLeft` and the clock would produce a second answer that disagrees
 * with the one the write is actually checked against — which is how you get a
 * button that looks available and fails.
 *
 * **It never shows an empty state for a failed request.** "Nothing scheduled"
 * and "we couldn't reach the server" are different claims.
 *
 * **It never claims a booking it does not have.** After a booking or a
 * cancellation the schedule is re-read rather than patched locally: the seat was
 * claimed by a conditional update on the server, and the server is the only
 * thing that knows whether it succeeded.
 *
 * One deviation from the handoff, noted where it happens: its failure state is
 * a title and a Try again pill with no body line. That drops the distinction
 * between "you're offline" and "our server broke", which CLAUDE.md requires the
 * copy to make — so the body line is kept, styled to match the empty state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RadialBloom } from "../../ui/bio/RadialBloom";
import { FlatHeader } from "../../ui/bio/FlatHeader";
import { Spinner } from "../../ui/Spinner";
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

/**
 * Two weeks — the server's own cap, and what the empty copy promises.
 *
 * The empty state says "the next two weeks", so the query has to actually cover
 * two weeks or that sentence is wrong.
 */
const DAYS = 14;

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
      setClasses(await fetchSchedule(undefined, DAYS, venueId ?? undefined));
    } catch (e) {
      // Left null rather than [] — an empty list here would say "no classes"
      // about a request that never arrived.
      setFailed(classifyNetError(e));
    }
  }, [venueId]);

  useEffect(() => {
    void (async () => {
      try {
        setVenues(await fetchVenues());
      } catch {
        // The venue filter is a convenience; losing it must not take the
        // schedule down with it.
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
      try {
        if (c.yourBooking === "BOOKED") await cancelBooking(c.id);
        else await bookClass(c.id);
        successHaptic();
      } catch (e) {
        errorHaptic();
        // The server's own message: it distinguishes cases this screen
        // deliberately does not model — full, cancelled, already started,
        // already booked on another device.
        setNotice(e instanceof Error ? e.message : "That didn't go through.");
      } finally {
        setBusyId(null);
        // Re-read either way. A failed booking may still have changed what is
        // true — somebody else took the seat — and a stale card invites the
        // same tap again.
        await load();
      }
    },
    [busyId, load],
  );

  const days = useMemo(() => groupByDay(classes ?? []), [classes]);

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
        <FlatHeader title="Classes" label="Gym" onBack={onBack} />

        <View style={styles.tiles}>
          <Tile label="Check in" hint="You're here" onPress={onCheckIn} />
          <Tile label="Coaches" hint="Find a trainer" onPress={onCoaches} />
          <Tile label="History" hint="Your visits" onPress={onHistory} />
        </View>

        {/* The handoff hides the venue filter while loading and on failure —
            a filter over nothing is furniture. */}
        {classes !== null && venues.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipRow}
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
          <View style={styles.centre}>
            <Text style={styles.bigTitle}>Couldn't load the schedule</Text>
            {/* Kept against the handoff: "offline" and "our end broke" are
                different claims and only one is true. */}
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
              accessibilityLabel="Try loading the schedule again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : classes === null ? (
          <View style={styles.centre}>
            <Spinner tint={bio.color.teal} />
          </View>
        ) : classes.length === 0 ? (
          <View style={styles.centre}>
            <Text style={styles.bigTitle}>Nothing scheduled</Text>
            <Text style={styles.bigBody}>
              {venueId
                ? "No classes at this venue in the next two weeks."
                : "No classes posted for the next two weeks."}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            {days.map((day) => (
              <View key={day.heading}>
                <Text style={styles.dayHeading}>{day.heading.toUpperCase()}</Text>
                <View style={styles.cards}>
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
              </View>
            ))}
          </ScrollView>
        )}
      </View>
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
  const cancelled = cls.state === "CANCELLED";
  const reason = unbookableReason(cls.state);
  const seats = seatsLabel(cls.seatsLeft);

  // Cancelling is allowed right up to the start, so a booked seat on a class
  // that is merely FULL keeps its button — "full" is not a reason you cannot
  // leave.
  const canAct = booked ? cls.state !== "PAST" && cls.state !== "IN_PROGRESS" : reason === null;

  return (
    <View style={[styles.card, cancelled && styles.cardOff]}>
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
        ) : seats && !cancelled ? (
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

      {cancelled ? (
        // Why, not merely that. A cancellation with no reason is a
        // notification rather than an explanation.
        <Text style={styles.cancelled}>
          Cancelled{cls.cancelReason ? ` — ${cls.cancelReason}` : ""}
        </Text>
      ) : canAct ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              pressHaptic();
              onAct();
            }}
            disabled={busy || disabled}
            style={({ pressed }) => [
              booked ? styles.ghostBtn : styles.bookBtn,
              pressed && styles.pressed,
              (busy || disabled) && styles.btnOff,
            ]}
            accessibilityRole="button"
            accessibilityLabel={booked ? `Cancel your place on ${cls.title}` : `Book ${cls.title}`}
            accessibilityState={{ disabled: busy || disabled }}
          >
            <Text style={booked ? styles.ghostBtnText : styles.bookBtnText}>
              {busy ? "…" : booked ? "Cancel" : "Book"}
            </Text>
          </Pressable>
        </View>
      ) : reason && !attended ? (
        // No button at all, and the reason in its place. A disabled control
        // that can only fail is worse than no control.
        <View style={styles.reasonRow}>
          <Text style={styles.reason}>{reason}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Tile({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
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
  frame: { flex: 1, paddingHorizontal: 18 },
  pressed: { transform: [{ scale: 0.97 }] },

  tiles: { flexDirection: "row", gap: 8, marginTop: 14 },
  tile: {
    flex: 1,
    backgroundColor: bio.color.surface,
    borderRadius: bio.gym.tile.radius,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    paddingVertical: bio.gym.tile.padV,
    paddingHorizontal: bio.gym.tile.padH,
  },
  tileLabel: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.alpha(0.95) },
  tileHint: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.45), marginTop: 3 },

  chipRow: { flexGrow: 0, marginTop: 12 },
  chips: { gap: 8, paddingRight: 18 },
  chip: {
    paddingVertical: bio.gym.filterChip.padV,
    paddingHorizontal: bio.gym.filterChip.padH,
    borderRadius: bio.gym.filterChip.radius,
    borderWidth: 1,
    borderColor: bio.alpha(0.13),
  },
  chipOn: { borderColor: bio.tealAlpha(0.38), backgroundColor: bio.tealAlpha(0.12) },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: bio.gym.filterChip.size,
    color: bio.alpha(0.55),
  },
  chipTextOn: { fontFamily: fontFamily.semibold, color: bio.color.teal },

  dayHeading: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: bio.alpha(0.38),
    marginTop: 14,
    marginBottom: 8,
  },

  list: { paddingTop: 0 },
  cards: { gap: bio.gym.card.gap },
  card: {
    backgroundColor: bio.color.surface,
    borderRadius: bio.gym.card.radius,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    paddingVertical: bio.gym.card.padV,
    paddingHorizontal: bio.gym.card.padH,
  },
  cardOff: { opacity: 0.6 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  time: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
    color: bio.color.teal,
    fontVariant: ["tabular-nums"],
  },
  seats: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.color.seatsLow },
  seatsFull: { fontFamily: fontFamily.medium, color: bio.alpha(0.4) },
  bookedChip: {
    paddingVertical: bio.gym.statusChip.padV,
    paddingHorizontal: bio.gym.statusChip.padH,
    borderRadius: bio.gym.statusChip.radius,
    backgroundColor: bio.tealAlpha(0.13),
  },
  bookedChipText: {
    fontFamily: fontFamily.bold,
    fontSize: bio.gym.statusChip.size,
    letterSpacing: 1.24,
    color: bio.color.teal,
  },
  attendedChip: {
    paddingVertical: bio.gym.statusChip.padV,
    paddingHorizontal: bio.gym.statusChip.padH,
    borderRadius: bio.gym.statusChip.radius,
    backgroundColor: bio.alpha(0.07),
  },
  attendedChipText: {
    fontFamily: fontFamily.bold,
    fontSize: bio.gym.statusChip.size,
    letterSpacing: 1.24,
    color: bio.alpha(0.5),
  },

  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: bio.alpha(0.97),
    marginTop: 5,
  },
  meta: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.alpha(0.45), marginTop: 3 },
  cancelled: {
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    color: bio.color.coral,
    marginTop: 8,
  },

  actionRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  reasonRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  reason: { fontFamily: fontFamily.medium, fontSize: 12.5, color: bio.alpha(0.4) },
  bookBtn: {
    paddingVertical: bio.gym.rowBtn.padV,
    paddingHorizontal: bio.gym.rowBtn.padHFilled,
    borderRadius: bio.gym.rowBtn.radius,
    backgroundColor: bio.color.teal,
  },
  bookBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: bio.gym.rowBtn.size,
    color: bio.color.onTealSolid,
  },
  ghostBtn: {
    paddingVertical: bio.gym.rowBtn.padV,
    paddingHorizontal: bio.gym.rowBtn.padHGhost,
    borderRadius: bio.gym.rowBtn.radius,
    borderWidth: 1,
    borderColor: bio.alpha(0.18),
  },
  ghostBtnText: {
    fontFamily: fontFamily.semibold,
    fontSize: bio.gym.rowBtn.size,
    color: bio.alpha(0.82),
  },
  btnOff: { opacity: 0.45 },

  notice: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.coral, marginTop: 12 },

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
