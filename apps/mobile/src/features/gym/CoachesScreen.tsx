/**
 * The coach directory (§6).
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
 * while booking is a hand-off to their own page, and becomes false the instant
 * the platform takes a fee — so it is computed rather than typed into this
 * file, exactly like §7's disclaimer. If the note is null, nothing is said.
 *
 * And a coach with no way to be paid gets no Book button. An account id exists
 * long before onboarding finishes, so only `payments` may gate that — a button
 * that fails at the moment of use is the photo-upload bug with a new vendor.
 */
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { initials } from "../../lib/format";
import { fetchCoaches, type Coach } from "./gymApi";

/**
 * The specialty filters, mirroring `COACH_SPECIALTIES` in
 * `packages/shared/src/coaches.ts`.
 *
 * Duplicated because mobile cannot import shared (CLAUDE.md). A slug this build
 * does not know is harmless — it simply is not offered as a filter — and the
 * labels a coach's own card shows come from the server, so a newer catalogue
 * still renders correctly here.
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
      // The page already on screen stays. Losing "load more" is a smaller
      // failure than replacing a list someone is reading with an error.
    } finally {
      setMore(false);
    }
  }, [cursor, more, specialty]);

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
        <ScreenHeader title="Coaches" label="Gym" onBack={onBack} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
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

        {failed ? (
          <LoadFailed what="the coach list" kind={failed} onRetry={() => void load()} />
        ) : coaches === null ? (
          <View style={styles.loading}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : coaches.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No coaches listed</Text>
            <Text style={styles.emptyBody}>
              {specialty
                ? "Nobody is listed under this yet. Try All."
                : "No trainers have listed themselves yet. Being verified and being listed are separate — a coach chooses the second."}
            </Text>
          </View>
        ) : (
          <>
            {coaches.map((c) => (
              <CoachCard key={c.userId} coach={c} />
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CoachCard({ coach }: { coach: Coach }) {
  const canBook = coach.payments === "EXTERNAL_LINK" && coach.bookingUrl;

  return (
    <View style={styles.card}>
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
        <Text style={styles.bio} numberOfLines={4}>
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
            <Text style={styles.bookBtnText}>Book with {coach.displayName.split(" ")[0]}</Text>
          </Pressable>
          {/* Derived on the server. Absent rather than guessed when the
              platform's position in the payment path changes. */}
          {coach.payoutNote ? <Text style={styles.payout}>{coach.payoutNote}</Text> : null}
        </>
      ) : (
        // No button at all rather than a disabled one: there is nothing to
        // press yet, and saying so is more use than a control that fails.
        <Text style={styles.noBooking}>
          No online booking yet — ask at the desk.
        </Text>
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
  content: { paddingHorizontal: 20 },
  flexMin: { flex: 1, minWidth: 0 },

  chips: { gap: 8, paddingVertical: 16, paddingRight: 20 },
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

  card: {
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.card,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: bio.tealAlpha(0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 15, color: bio.color.tealLt },
  name: { fontFamily: fontFamily.semibold, fontSize: 17, color: bio.color.text },
  specialties: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: bio.alpha(0.45),
    marginTop: 2,
  },
  bio: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: bio.alpha(0.62),
    marginTop: 12,
    lineHeight: 20,
  },

  bookBtn: {
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.color.tealDeep,
    alignItems: "center",
  },
  bookBtnText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.onTeal },
  payout: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: bio.alpha(0.4),
    marginTop: 8,
    textAlign: "center",
    lineHeight: 16,
  },
  noBooking: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: bio.alpha(0.4),
    marginTop: 14,
  },

  moreBtn: {
    paddingVertical: 12,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
    alignItems: "center",
    marginTop: 4,
  },
  moreText: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.alpha(0.65) },
  pressed: { transform: [{ scale: 0.97 }] },

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
});
