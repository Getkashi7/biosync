/**
 * The coach directory (§6) — built to the A3 handoff.
 *
 * Two claims on this screen are load-bearing, and neither is written here.
 *
 * **Who appears.** The list is exactly the coaches who opted in AND currently
 * hold a verified trainer capability — enforced in the server's query, not
 * filtered after the fact, so a suspension delists someone on the next read.
 * There is nothing this screen can do to widen that.
 *
 * **Where the money goes.** `payoutNote` arrives derived from the coach's
 * payment state. "You pay your coach directly — BIOSYNC takes nothing" is true
 * while booking is a hand-off to their own page and becomes false the instant
 * the platform takes a fee, so it is computed rather than typed into this file
 * — exactly like §7's disclaimer. When the note is null, nothing is said.
 *
 * A coach with no way to be paid gets no Book button, only a line saying to ask
 * at the desk. An account id exists long before onboarding finishes, so only
 * `payments` may gate that — a button that fails at the moment of use is the
 * photo-upload bug with a new vendor.
 *
 * No photos: coach images are not served yet (no signed-read path), and a card
 * designed around one would have to be rebuilt. The handoff agrees — its card
 * leads with initials.
 */
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RadialBloom } from "../../ui/bio/RadialBloom";
import { FlatHeader } from "../../ui/bio/FlatHeader";
import { Spinner } from "../../ui/Spinner";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { initials } from "../../lib/format";
import { fetchCoaches, type Coach } from "./gymApi";

/**
 * The filters, mirroring `COACH_SPECIALTIES` in `packages/shared/src/coaches.ts`.
 *
 * Duplicated because mobile cannot import shared (CLAUDE.md). A slug this build
 * does not know is simply not offered as a filter, and the labels on a coach's
 * own card come from the server — so a newer catalogue still renders correctly.
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

const LABEL_OF = new Map(SPECIALTIES.map((s) => [s.slug, s.label]));

export function CoachesScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [coaches, setCoaches] = useState<Coach[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    setFailed(null);
    setCoaches(null);
    try {
      const res = await fetchCoaches(specialty ?? undefined);
      setCoaches(res.coaches);
      setCursor(res.cursor);
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, [specialty]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || more) return;
    setMore(true);
    try {
      const res = await fetchCoaches(specialty ?? undefined, cursor);
      setCoaches((prev) => [...(prev ?? []), ...res.coaches]);
      setCursor(res.cursor);
    } catch {
      // The page already on screen stays. Replacing a list somebody is reading
      // because the NEXT page failed is the worse outcome.
    } finally {
      setMore(false);
    }
  }, [cursor, more, specialty]);

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
        <FlatHeader title="Coaches" label="Gym" onBack={onBack} />

        {/* Hidden while there is nothing to filter — a filter over an error or
            an empty directory is furniture. */}
        {coaches !== null && coaches.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipRow}
          >
            <Chip label="All" on={specialty === null} onPress={() => setSpecialty(null)} />
            {SPECIALTIES.map((s) => (
              <Chip
                key={s.slug}
                label={s.label}
                on={specialty === s.slug}
                onPress={() => setSpecialty(s.slug)}
              />
            ))}
          </ScrollView>
        ) : null}

        {failed ? (
          <View style={styles.centre}>
            <Text style={styles.bigTitle}>Couldn't load coaches</Text>
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
              accessibilityLabel="Try loading coaches again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : coaches === null ? (
          <View style={styles.centre}>
            <Spinner tint={bio.color.teal} />
          </View>
        ) : coaches.length === 0 ? (
          <View style={styles.centre}>
            <Text style={styles.bigTitle}>
              {specialty ? "Nobody listed under this" : "No coaches yet"}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            showsVerticalScrollIndicator={false}
          >
            {coaches.map((c, i) => (
              <CoachCard key={c.userId} coach={c} first={i === 0} />
            ))}
            {cursor ? (
              <Pressable
                onPress={() => {
                  pressHaptic();
                  void loadMore();
                }}
                disabled={more}
                style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Show more coaches"
              >
                <Text style={styles.moreText}>{more ? "…" : "Show more"}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function CoachCard({ coach, first }: { coach: Coach; first: boolean }) {
  const canBook = coach.payments === "EXTERNAL_LINK" && coach.bookingUrl;
  const firstName = coach.displayName.split(" ")[0] ?? coach.displayName;

  return (
    <View style={[styles.card, first ? styles.cardFirst : styles.cardNext]}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(coach.displayName)}</Text>
        </View>
        <View style={styles.flexMin}>
          <Text style={styles.name} numberOfLines={1}>
            {coach.displayName}
          </Text>
          {coach.specialties.length > 0 ? (
            <Text style={styles.specialties} numberOfLines={1}>
              {coach.specialties.map((s) => LABEL_OF.get(s) ?? s).join(" · ")}
            </Text>
          ) : null}
        </View>
      </View>

      {coach.bio ? (
        <Text style={styles.bio} numberOfLines={5}>
          {coach.bio}
        </Text>
      ) : null}

      {canBook ? (
        <>
          <Pressable
            onPress={() => {
              pressHaptic();
              if (coach.bookingUrl) void Linking.openURL(coach.bookingUrl);
            }}
            style={({ pressed }) => [styles.bookBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Book with ${coach.displayName} — opens their own booking page`}
          >
            <Text style={styles.bookBtnText}>Book with {firstName}</Text>
          </Pressable>
          {/* Derived on the server; absent rather than guessed when the
              platform's position in the payment path changes. */}
          {coach.payoutNote ? <Text style={styles.payout}>{coach.payoutNote}</Text> : null}
        </>
      ) : (
        // No button at all rather than a disabled one: there is nothing to
        // press yet, and saying so is more use than a control that fails.
        <Text style={styles.noBooking}>No online booking yet — ask at the desk.</Text>
      )}
    </View>
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
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  frame: { flex: 1, paddingHorizontal: 18 },
  flexMin: { flex: 1, minWidth: 0 },
  pressed: { transform: [{ scale: 0.97 }] },

  chipRow: { flexGrow: 0, marginTop: 14 },
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

  card: {
    backgroundColor: bio.color.surface,
    borderRadius: bio.gym.card.radius,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    padding: 18,
  },
  cardFirst: { marginTop: 16 },
  cardNext: { marginTop: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: bio.tealAlpha(0.13),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.bold, fontSize: 14, color: bio.color.teal },
  name: { fontFamily: fontFamily.semibold, fontSize: 17, color: bio.alpha(0.97) },
  specialties: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    color: bio.alpha(0.45),
    marginTop: 2,
  },
  bio: {
    fontFamily: fontFamily.regular,
    fontSize: 13.5,
    lineHeight: 21,
    color: bio.alpha(0.62),
    marginTop: 12,
  },

  bookBtn: {
    marginTop: 14,
    height: 44,
    borderRadius: 999,
    backgroundColor: bio.color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  bookBtnText: { fontFamily: fontFamily.bold, fontSize: 14, color: bio.color.onTealSolid },
  payout: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: bio.alpha(0.4),
    marginTop: 8,
  },
  noBooking: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: bio.alpha(0.45),
    marginTop: 14,
  },

  moreBtn: {
    marginTop: 14,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: bio.alpha(0.16),
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.alpha(0.78) },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  bigTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 16.5,
    color: bio.alpha(0.9),
    textAlign: "center",
  },
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
