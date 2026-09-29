/**
 * The §7 offer — the "IV upsell" from the brief, built to say only true things.
 *
 * The brief's copy was *"Low energy? A practitioner can review an IV protocol
 * tailored to your data."* Two words in that are not safe to ship. "IV protocol"
 * names a treatment category to someone who has not been assessed, and "tailored
 * to your data" claims a personalisation we do not perform — the app matched a
 * threshold, it did not tailor anything. Both are the sort of sentence the
 * catalogue guard exists to keep out of `TREATMENT_PROTOCOLS`, and a modal is
 * not a loophole in that rule.
 *
 * So this restates the user's own reading, exactly as the suggestion does, and
 * offers a question rather than a product. The primary action is "Ask a
 * practitioner", never "Book" — nothing is bookable until someone has decided.
 *
 * When it may appear at all is `lib/treatmentOffer.ts`, not here: a rate limit
 * buried in a component is a rate limit nobody can review.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { TREATMENT_DISCLAIMER } from "../../lib/treatmentCopy";
import { TreatmentSheet } from "./TreatmentSheet";
import type { Suggestion } from "./treatmentsApi";

export function TreatmentOfferSheet({
  suggestion,
  onClose,
  onOpenTreatments,
}: {
  /** the strongest thing the user's own readings surfaced */
  suggestion: Suggestion;
  onClose: () => void;
  onOpenTreatments: () => void;
}) {
  return (
    <TreatmentSheet
      title="Worth asking about?"
      subtitle="From your own check-ins."
      onClose={onClose}
    >
      {/* The user's own count, restated — the same sentence the suggestion
          carries, computed server-side. Never a claim about what would help. */}
      <View style={styles.reasonBox}>
        <Text style={styles.reasonText}>{suggestion.reason}</Text>
      </View>

      {/*
        The summary comes straight from the catalogue, where it has already been
        through the product- and claim-word guard. Composing a fresh sentence
        around the protocol name here would be a second, unreviewed place for
        copy about a treatment to exist — and it read badly besides.
      */}
      <Text style={styles.body}>{suggestion.summary}</Text>
      <Text style={styles.body}>
        Nothing is booked, and nothing happens unless they decide it should.
      </Text>

      <View style={styles.disclaimer}>
        <Svg width={13} height={15} viewBox="0 0 13 15" fill="none">
          <Path
            d="M6.5 1 L12 3 V7.6 C12 11 9.4 13.2 6.5 14 C3.6 13.2 1 11 1 7.6 V3 Z"
            stroke={bio.color.blue}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.disclaimerText}>{TREATMENT_DISCLAIMER}</Text>
      </View>

      <Pressable
        onPress={() => {
          pressHaptic();
          onOpenTreatments();
        }}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>Ask Biomeds</Text>
      </Pressable>

      <Pressable onPress={onClose} style={styles.dismiss} accessibilityRole="button">
        <Text style={styles.dismissText}>Not now</Text>
      </Pressable>
    </TreatmentSheet>
  );
}

const styles = StyleSheet.create({
  reasonBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: bio.radius.xs,
    backgroundColor: bio.blueAlpha(0.07),
    borderWidth: 1,
    borderColor: bio.blueAlpha(0.22),
  },
  reasonText: {
    fontFamily: fontFamily.medium,
    fontSize: 13.5,
    lineHeight: 20,
    color: bio.alpha(0.88),
  },
  body: {
    fontFamily: fontFamily.light,
    fontSize: 13,
    lineHeight: 20,
    color: bio.alpha(0.6),
    marginTop: 14,
  },
  disclaimer: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 16 },
  disclaimerText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17.5,
    color: bio.alpha(0.72),
  },
  cta: {
    height: 52,
    borderRadius: 15,
    marginTop: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: bio.blueAlpha(0.16),
    borderWidth: 1,
    borderColor: bio.blueAlpha(0.44),
  },
  ctaText: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.blueLt },
  dismiss: { alignItems: "center", paddingVertical: 14 },
  dismissText: { fontFamily: fontFamily.medium, fontSize: 13.5, color: bio.alpha(0.5) },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
