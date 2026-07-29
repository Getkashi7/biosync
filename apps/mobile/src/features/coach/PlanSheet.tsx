/**
 * Coach plan sheet — the AI trio's day-plan (design language: dark ink glass +
 * aurora, teal accent, matching Ask). A focus selector (Balanced · Training ·
 * Recovery) drives a short, non-diagnostic plan the coach builds from the user's
 * data: a title, a warm intro, and a few labelled blocks. Regenerate re-asks.
 *
 * Presentation + wiring only; generation lives in `assistant.plan` via planApi.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { Spinner } from "../../ui/Spinner";
import { pressHaptic, selectionHaptic } from "../../lib/haptics";
import { bio, fontFamily, motion } from "../../ui/theme";
import { generatePlan, type Plan, type PlanFocus } from "./planApi";

const FOCUSES: { key: PlanFocus; label: string }[] = [
  { key: "balanced", label: "Balanced" },
  { key: "training", label: "Training" },
  { key: "recovery", label: "Recovery" },
];

/** rotating accent per block, so the plan reads as a set of distinct moments */
const BLOCK_HUES = [bio.color.tealLt, bio.color.violet, bio.color.blue, bio.color.amber, bio.color.coral];

const LOCAL_ERROR: Plan = {
  title: "Couldn’t build your plan",
  intro: "I hit a snag reaching the coach. Give it a moment and try again.",
  blocks: [{ label: "Retry", detail: "Tap regenerate — this is usually a brief network hiccup." }],
};

export function PlanSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState<PlanFocus>("balanced");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (f: PlanFocus) => {
    setLoading(true);
    try {
      const { plan: next } = await generatePlan(f);
      setPlan(next);
    } catch {
      setPlan(LOCAL_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("balanced");
  }, [load]);

  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut }, (f) => {
      if (f) runOnJS(onClose)();
    });
  }, [onClose, scrimP, sheetP]);

  const onSheetLayout = (h: number) => {
    sheetH.value = h;
    if (!opened.current && h > 0) {
      opened.current = true;
      sheetP.value = withTiming(1, { duration: motion.duration.sheetOpen, easing: motion.easeOut });
      scrimP.value = withTiming(1, { duration: motion.duration.sheetScrim, easing: motion.easeOut });
    }
  };
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 640) }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  const pickFocus = (f: PlanFocus) => {
    if (f === focus || loading) return;
    selectionHaptic();
    setFocus(f);
    void load(f);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 20 }, sheetStyle]}
        onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
      >
        <AuroraField
          blobs={[
            { hue: bio.aurora.teal, size: 360, cx: true, top: -40, stops: [{ o: 0, a: 0.28 }, { o: 50, a: 0.1 }, { o: 74, a: 0 }] },
            { hue: bio.aurora.violet, size: 260, right: -100, top: 120, stops: [{ o: 0, a: 0.14 }, { o: 70, a: 0 }], variant: "b" },
          ]}
        />
        <View style={styles.grabber} />
        <Text style={styles.title}>Coach plan</Text>

        <View style={styles.focusRow}>
          {FOCUSES.map((f) => {
            const on = f.key === focus;
            return (
              <Pressable key={f.key} onPress={() => pickFocus(f.key)} style={[styles.focusChip, on && styles.focusChipOn]}>
                <Text style={[styles.focusText, on && styles.focusTextOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loading}>
            <Spinner tint={bio.color.tealLt} />
            <Text style={styles.loadingText}>Reading your last 30 days…</Text>
          </View>
        ) : plan ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.planTitle}>{plan.title}</Text>
            <Text style={styles.planIntro}>{plan.intro}</Text>
            {plan.blocks.map((b, i) => {
              const hue = BLOCK_HUES[i % BLOCK_HUES.length]!;
              return (
                <View key={i} style={styles.block}>
                  <View style={styles.blockHead}>
                    <View style={[styles.blockDot, { backgroundColor: hue, shadowColor: hue }]} />
                    <Text style={[styles.blockLabel, { color: hue }]}>{b.label.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.blockDetail}>{b.detail}</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.disclaimer}>
          <View style={styles.disclaimerDot} />
          <Text style={styles.disclaimerText}>Wellness guidance — not medical advice</Text>
        </View>

        <Pressable
          onPress={() => {
            pressHaptic();
            void load(focus);
          }}
          disabled={loading}
          style={({ pressed }) => [styles.regen, loading && styles.regenIdle, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Regenerate plan"
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          <Text style={styles.regenText}>Regenerate</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: bio.color.scrim },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    backgroundColor: bio.color.ink,
    borderTopLeftRadius: bio.radius.screen,
    borderTopRightRadius: bio.radius.screen,
    borderTopWidth: 1,
    borderColor: bio.color.hairline,
    paddingTop: 10,
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: bio.alpha(0.28), alignSelf: "center" },
  title: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: bio.color.text, marginTop: 18 },

  focusRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  focusChip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.color.border2,
  },
  focusChipOn: { backgroundColor: bio.tealAlpha(0.12), borderColor: bio.tealAlpha(0.4) },
  focusText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.alpha(0.6) },
  focusTextOn: { color: bio.color.tealLt },

  loading: { paddingVertical: 48, alignItems: "center", gap: 14 },
  loadingText: { fontFamily: fontFamily.light, fontSize: 13, color: bio.alpha(0.5) },

  scroll: { marginTop: 18, flexShrink: 1 },
  scrollContent: { paddingBottom: 8 },
  planTitle: { fontFamily: fontFamily.bold, fontSize: 19, letterSpacing: -0.19, color: bio.color.text },
  planIntro: { fontFamily: fontFamily.light, fontSize: 13.5, lineHeight: 21, color: bio.alpha(0.6), marginTop: 6, marginBottom: 14 },
  block: {
    borderRadius: bio.radius.sm,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.color.border2,
    padding: 15,
    marginBottom: 10,
  },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  blockDot: { width: 7, height: 7, borderRadius: 3.5, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  blockLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, letterSpacing: 1.2 },
  blockDetail: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 20, color: bio.alpha(0.8), marginTop: 8 },

  disclaimer: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.color.hairline,
    marginTop: 14,
    marginBottom: 12,
  },
  disclaimerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: bio.color.teal,
    shadowColor: bio.color.teal,
    shadowOpacity: 0.8,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  disclaimerText: { fontFamily: fontFamily.medium, fontSize: 10.5, letterSpacing: 0.2, color: bio.alpha(0.5) },

  regen: {
    height: 52,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.tealAlpha(0.12),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.4),
    alignItems: "center",
    justifyContent: "center",
  },
  regenIdle: { opacity: 0.5 },
  regenText: { fontFamily: fontFamily.semibold, fontSize: 15, color: bio.color.tealLt },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
