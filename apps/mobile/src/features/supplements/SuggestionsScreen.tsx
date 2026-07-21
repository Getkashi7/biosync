/**
 * Worth knowing (design 2B) — informational reading only, and its unavailable
 * state (2C).
 *
 * These cards carry NO doses and NO advice: one general sentence each about what
 * is commonly studied, plus evidence dots for how well-established that general
 * research is (never a rating of the user). The server already drops anything
 * that strays into treatment or dosing; when nothing safe survives we show the
 * calm "nothing to show" state rather than filler.
 *
 * "Add to my stack" hands the NAME to the add sheet — the user still writes
 * their own dose and timing. The app never fills those in.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { InfoBanner } from "./SupplementsScreen";
import { fetchSuggestions, type Suggestion } from "./supplementsApi";

type Load = "loading" | "ready" | "unavailable";

export function SuggestionsScreen({ onBack, onAdd }: { onBack: () => void; onAdd: (name: string) => void }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<Load>("loading");
  const [cards, setCards] = useState<Suggestion[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const result = await fetchSuggestions();
      if (result && result.length > 0) {
        setCards(result);
        setState("ready");
      } else {
        setState("unavailable");
      }
    } catch {
      setState("unavailable");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.magenta, size: 440, cx: true, top: -50, stops: [{ o: 0, a: 0.3 }, { o: 46, a: 0.1 }, { o: 72, a: 0 }], variant: "a" },
          { hue: bio.aurora.magenta, size: 300, left: -120, bottom: 120, stops: [{ o: 0, a: 0.12 }, { o: 70, a: 0 }], variant: "b", delayMs: -5000 },
        ]}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Worth knowing" label="General · informational" onBack={onBack} />

        <InfoBanner text="Informational only — not a prescription. No doses, no advice." />

        {state === "loading" ? (
          <View style={styles.centre}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : state === "unavailable" ? (
          <View style={styles.centre}>
            <Text style={styles.emptyTitle}>Nothing to show right now</Text>
            <Text style={styles.emptySub}>Keep logging your check-ins and come back later.</Text>
            <Pressable onPress={() => void load()} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cards}>
            {cards.map((c, i) => (
              <SuggestionCard key={`${c.name}-${i}`} card={c} onAdd={() => onAdd(c.name)} />
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Worth raising with a pharmacist or doctor.</Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Wellness guidance, not medical advice</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SuggestionCard({ card, onAdd }: { card: Suggestion; onAdd: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardName}>
          <View style={styles.hueDot} />
          <Text style={styles.nameText} numberOfLines={1}>
            {card.name}
          </Text>
        </View>
        <View style={styles.evidence}>
          <Text style={styles.evidenceLabel}>EVIDENCE</Text>
          <View style={styles.evidenceDots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.evDot, i < card.evidence ? styles.evOn : styles.evOff]} />
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.rationale}>{card.rationale}</Text>

      <Pressable
        onPress={() => {
          pressHaptic();
          onAdd();
        }}
        style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Svg width={11} height={11} viewBox="0 0 11 11" fill="none">
          <Path d="M5.5 0 V11 M0 5.5 H11" stroke={bio.color.magentaLt} strokeWidth={2} strokeLinecap="round" />
        </Svg>
        <Text style={styles.addText}>Add to my stack</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, flexGrow: 1 },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: bio.color.text, textAlign: "center" },
  emptySub: {
    fontFamily: fontFamily.light,
    fontSize: 13.5,
    lineHeight: 20,
    color: bio.alpha(0.55),
    textAlign: "center",
    maxWidth: 260,
    marginTop: 8,
  },
  retry: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.magentaAlpha(0.08),
    borderWidth: 1,
    borderColor: bio.magentaAlpha(0.3),
  },
  retryText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.color.magentaLt },

  cards: { gap: 10, marginTop: 16 },
  card: {
    borderRadius: 22,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardName: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1, minWidth: 0 },
  hueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: bio.color.magenta,
    shadowColor: bio.color.magenta,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  nameText: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 15, color: bio.color.text },
  evidence: { flexDirection: "row", alignItems: "center", gap: 6 },
  evidenceLabel: { fontFamily: fontFamily.bold, fontSize: 8.5, letterSpacing: 1.19, color: bio.alpha(0.35) },
  evidenceDots: { flexDirection: "row", gap: 3 },
  evDot: { width: 6, height: 6, borderRadius: 3 },
  evOn: { backgroundColor: bio.color.magenta },
  evOff: { borderWidth: 1.4, borderColor: bio.alpha(0.28) },

  rationale: { fontFamily: fontFamily.light, fontSize: 12.5, lineHeight: 19, color: bio.alpha(0.6), marginTop: 9 },

  addBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.magentaAlpha(0.08),
    borderWidth: 1,
    borderColor: bio.magentaAlpha(0.3),
  },
  addText: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.color.magentaLt },

  footer: { marginTop: "auto", paddingTop: 16, alignItems: "center", gap: 8 },
  footerText: { fontFamily: fontFamily.regular, fontSize: 11.5, color: bio.alpha(0.5), textAlign: "center" },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  chipText: { fontFamily: fontFamily.semibold, fontSize: 9.5, letterSpacing: 0.5, color: bio.alpha(0.45) },

  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
