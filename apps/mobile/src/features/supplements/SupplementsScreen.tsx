/**
 * Supplements — the user's stack (design 1A) and its first-run state (1C).
 *
 * INFORMATIONAL ONLY, and the screen says so: a pinned banner, and copy that
 * makes clear every entry is something the user already takes, in their own
 * words. Nothing here prescribes, and no dose is ever suggested by the app.
 *
 * The adherence ring (Doto "4/6") is the shared dotted gauge in magenta; tapping
 * it opens today's dose strip.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { DottedRing } from "../../ui/bio/DottedRing";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { fetchDay, removeSupplement, type StackItem, type SupplementDay, type Timing } from "./supplementsApi";

const TIMINGS: Timing[] = ["AM", "PRE", "PM"];

type Props = {
  onBack: () => void;
  onAdd: () => void;
  onOpenDoses: () => void;
  onOpenSuggestions: () => void;
  refreshKey: number;
};

export function SupplementsScreen({ onBack, onAdd, onOpenDoses, onOpenSuggestions, refreshKey }: Props) {
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState<SupplementDay | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setDay(await fetchDay());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onRemove = useCallback(
    async (id: string) => {
      pressHaptic();
      setOpenId(null);
      await removeSupplement(id);
      await load();
    },
    [load],
  );

  const stack = day?.stack ?? [];
  const empty = day !== null && stack.length === 0;

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={
          empty
            ? [
                { hue: bio.aurora.magenta, size: 500, cx: true, top: 90, stops: [{ o: 0, a: 0.36 }, { o: 46, a: 0.13 }, { o: 72, a: 0 }], variant: "a" },
                { hue: bio.aurora.violet, size: 280, left: -110, bottom: 70, stops: [{ o: 0, a: 0.16 }, { o: 70, a: 0 }], variant: "b", delayMs: -6000 },
              ]
            : [
                { hue: bio.aurora.magenta, size: 460, cx: true, top: -40, stops: [{ o: 0, a: 0.34 }, { o: 46, a: 0.12 }, { o: 72, a: 0 }], variant: "a" },
                { hue: bio.aurora.violet, size: 300, right: -120, bottom: 150, stops: [{ o: 0, a: 0.16 }, { o: 70, a: 0 }], variant: "b", delayMs: -5000 },
              ]
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />
        }
      >
        <ScreenHeader
          title="Supplements"
          label={stack.length > 0 ? `Your stack · ${stack.length} item${stack.length === 1 ? "" : "s"}` : "Your stack"}
          onBack={onBack}
          right={
            day && day.due > 0 ? (
              <Pressable onPress={onOpenDoses} accessibilityRole="button" accessibilityLabel="Today's doses">
                <DottedRing
                  size={60}
                  radius={26}
                  progress={day.adherence}
                  color={bio.color.magenta}
                  delayMs={300}
                  trackWidth={1.6}
                  dotOn={0.4}
                  dotOff={3}
                >
                  <Text style={styles.ringText}>
                    {day.taken}/{day.due}
                  </Text>
                </DottedRing>
              </Pressable>
            ) : null
          }
        />

        <InfoBanner text="Informational only — not a prescription. You add what you already take." />

        {day === null ? (
          failed ? <LoadFailed what="your stack" onRetry={() => void load()} /> : null
        ) : empty ? (
          <EmptyStack onAdd={onAdd} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>TODAY</Text>
            <View style={styles.cards}>
              {stack.map((s) => (
                <StackCard
                  key={s.id}
                  item={s}
                  open={openId === s.id}
                  onToggle={() => {
                    pressHaptic();
                    setOpenId(openId === s.id ? null : s.id);
                  }}
                  onRemove={() => void onRemove(s.id)}
                />
              ))}
            </View>

            <Pressable
              onPress={() => {
                pressHaptic();
                onOpenSuggestions();
              }}
              style={({ pressed }) => [styles.worthKnowing, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.worthKnowingText}>Worth knowing · informational</Text>
              <Svg width={8} height={8} viewBox="0 0 9 9" fill="none">
                <Path d="M2 1 L6 4.5 L2 8" stroke={bio.color.magentaLt} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

export function InfoBanner({ text }: { text: string }) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerNode}>
        <Text style={styles.bannerNodeText}>i</Text>
      </View>
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

function StackCard({
  item,
  open,
  onToggle,
  onRemove,
}: {
  item: StackItem;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardRow}>
        <View style={styles.capsuleWrap}>
          <LinearGradient
            colors={[bio.color.magentaLt, bio.color.magentaDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.capsule}
          />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.chipRow}>
            {TIMINGS.map((t) => {
              const on = item.timings.includes(t);
              return (
                <View key={t} style={[styles.chip, on ? styles.chipOn : styles.chipOff]}>
                  <Text style={[styles.chipText, { color: on ? bio.color.magentaLt : bio.alpha(0.32) }]}>{t}</Text>
                </View>
              );
            })}
          </View>
        </View>
        <Text style={styles.dose}>{item.dose}</Text>
      </View>

      {open ? (
        <View style={styles.cardActions}>
          {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
          <Pressable onPress={onRemove} style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
            <Text style={styles.removeText}>Remove from stack</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Empty stack (1C) ─────────────────────────────────────────────────────────
const ORB = 190;

function EmptyStack({ onAdd }: { onAdd: () => void }) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 75_000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [spin, pulse]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const capsuleStyle = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.55, 1]) }));

  const c = 2 * Math.PI * 88;

  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyOrb}>
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          <Svg width={ORB} height={ORB}>
            <Circle
              cx={ORB / 2}
              cy={ORB / 2}
              r={88}
              fill="none"
              stroke={bio.magentaAlpha(0.4)}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeDasharray={[(0.4 / 100) * c, (3 / 100) * c]}
            />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.emptyCapsule, capsuleStyle]} />
      </View>

      <Text style={styles.emptyTitle}>Your stack is yours to build.</Text>
      <Text style={styles.emptySub}>
        BIOSYNC never prescribes — you add what you already take, in your own words.
      </Text>

      <Pressable
        onPress={() => {
          pressHaptic();
          onAdd();
        }}
        style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <View style={styles.emptyCtaDot} />
        <Text style={styles.emptyCtaText}>Add what you take</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, flexGrow: 1 },

  ringText: { fontFamily: fontFamily.dot, fontSize: 17, letterSpacing: 0.4, color: bio.color.text },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: bio.radius.sm,
    backgroundColor: bio.magentaAlpha(0.09),
    borderWidth: 1,
    borderColor: bio.magentaAlpha(0.24),
    marginTop: 16,
  },
  bannerNode: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: bio.magentaAlpha(0.8),
    alignItems: "center",
    justifyContent: "center",
  },
  bannerNodeText: { fontFamily: fontFamily.dot, fontSize: 11, color: bio.color.magentaLt },
  bannerText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 11.5, lineHeight: 16, color: bio.alpha(0.72) },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 20,
    marginBottom: 10,
  },

  cards: { gap: 9 },
  card: {
    borderRadius: 20,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  cardPressed: { transform: [{ scale: 0.985 }] },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  capsuleWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: bio.magentaAlpha(0.16),
    borderWidth: 1,
    borderColor: bio.magentaAlpha(0.3),
    alignItems: "center",
    justifyContent: "center",
  },
  capsule: { width: 7, height: 14, borderRadius: 999 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.text },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  chip: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: bio.radius.pill, borderWidth: 1 },
  chipOn: { backgroundColor: bio.magentaAlpha(0.16), borderColor: bio.magentaAlpha(0.5) },
  chipOff: { backgroundColor: bio.alpha(0.04), borderColor: bio.alpha(0.1) },
  chipText: { fontFamily: fontFamily.bold, fontSize: 9, letterSpacing: 0.9 },
  dose: { fontFamily: fontFamily.dot, fontSize: 17, letterSpacing: 0.4, color: bio.color.text },

  cardActions: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: bio.alpha(0.08), gap: 10 },
  note: { fontFamily: fontFamily.light, fontSize: 12.5, lineHeight: 18, color: bio.alpha(0.6) },
  removeBtn: {
    height: 38,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.coralAlpha(0.12),
    borderWidth: 1,
    borderColor: bio.coralAlpha(0.3),
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.coralLt2 },

  worthKnowing: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.magentaAlpha(0.08),
    borderWidth: 1,
    borderColor: bio.magentaAlpha(0.3),
  },
  worthKnowingText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.color.magentaLt },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 20 },
  emptyOrb: { width: ORB, height: ORB, alignItems: "center", justifyContent: "center" },
  emptyCapsule: {
    width: 26,
    height: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: bio.magentaAlpha(0.55),
    backgroundColor: bio.magentaAlpha(0.1),
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    letterSpacing: -0.22,
    lineHeight: 29,
    color: bio.color.text,
    textAlign: "center",
    maxWidth: 260,
    marginTop: 28,
  },
  emptySub: {
    fontFamily: fontFamily.light,
    fontSize: 13.5,
    lineHeight: 21,
    color: bio.alpha(0.55),
    textAlign: "center",
    maxWidth: 275,
    marginTop: 10,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 46,
    paddingLeft: 16,
    paddingRight: 20,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.07),
    borderWidth: 1,
    borderColor: bio.color.border,
    marginTop: 26,
  },
  emptyCtaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: bio.color.magenta,
    shadowColor: bio.color.magenta,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  emptyCtaText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.alpha(0.85) },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
