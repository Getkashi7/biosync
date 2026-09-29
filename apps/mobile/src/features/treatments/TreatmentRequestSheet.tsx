/**
 * Asking a practitioner to review a protocol.
 *
 * The confirm step exists precisely so this cannot feel like a booking. It
 * states what will happen in order — the practitioner reads it, then decides,
 * then contacts you — and the button says "Ask for a review", never "Book".
 *
 * Failures are shown with their real cause. `CONFLICT` (already asked) and
 * `PRECONDITION_FAILED` (no practitioner) are ordinary, explainable states that
 * the user can act on; flattening them into "something went wrong" would leave
 * someone pressing a button that will never work.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { classifyNetError } from "../../lib/netError";
import { TREATMENT_DISCLAIMER } from "../../lib/treatmentCopy";
import { TreatmentSheet } from "./TreatmentSheet";
import { requestReview, type Suggestion } from "./treatmentsApi";

const STEPS = [
  "The Biomeds doctor reads your request and the reading behind it.",
  "They decide whether a review is appropriate for you, and can decline.",
  "If they approve, they contact you to arrange it. BIOSYNC never books anything.",
];

/** tRPC error codes this sheet has real copy for. */
function messageFor(err: unknown): string {
  const code = (err as { data?: { code?: string } })?.data?.code;
  if (code === "CONFLICT") {
    return "You've already asked about this one. It's in your requests below.";
  }
  if (code === "PRECONDITION_FAILED") {
    return "You need to be connected to Biomeds before asking for a review.";
  }
  return classifyNetError(err) === "offline"
    ? "You look offline. Nothing has been sent — try again when you're back."
    : "Something went wrong on our end. Nothing has been sent.";
}

export function TreatmentRequestSheet({
  suggestion,
  onClose,
  onDone,
}: {
  suggestion: Suggestion;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    pressHaptic();
    setBusy(true);
    setError(null);
    try {
      await requestReview(suggestion.slug, note.trim() || undefined);
      onDone();
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  };

  return (
    <TreatmentSheet
      title={suggestion.name}
      subtitle="Asking is not booking."
      onClose={onClose}
    >
      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>WHY THIS CAME UP</Text>
        <Text style={styles.reasonText}>{suggestion.reason}</Text>
      </View>

      <Text style={styles.sectionLabel}>WHAT HAPPENS NEXT</Text>
      {STEPS.map((step, i) => (
        <View key={step} style={styles.step}>
          <View style={styles.stepNum}>
            <Text style={styles.stepNumText}>{i + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      <Text style={styles.sectionLabel}>ANYTHING THEY SHOULD KNOW?</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="Optional — a symptom, a question, a constraint."
        placeholderTextColor={bio.alpha(0.3)}
        multiline
        maxLength={500}
        editable={!busy}
      />

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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={() => void submit()}
        disabled={busy}
        style={({ pressed }) => [styles.cta, busy && styles.ctaOff, pressed && !busy && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{busy ? "Sending…" : "Ask for a review"}</Text>
      </Pressable>

      <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
        <Text style={styles.cancelText}>Not now</Text>
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
  reasonLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 9.5,
    letterSpacing: 1.2,
    color: bio.blueAlpha(0.75),
  },
  reasonText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: bio.alpha(0.85),
    marginTop: 5,
  },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: bio.alpha(0.42),
    marginTop: 20,
    marginBottom: 10,
  },

  step: { flexDirection: "row", gap: 11, alignItems: "flex-start", marginBottom: 11 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: bio.alpha(0.07),
    borderWidth: 1,
    borderColor: bio.alpha(0.13),
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontFamily: fontFamily.dotBold, fontSize: 11, color: bio.alpha(0.7) },
  stepText: {
    flex: 1,
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.alpha(0.6),
  },

  input: {
    minHeight: 78,
    borderRadius: bio.radius.xs,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.11),
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: fontFamily.light,
    fontSize: 13.5,
    lineHeight: 19,
    color: bio.color.text,
    textAlignVertical: "top",
  },

  disclaimer: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 16 },
  disclaimerText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17.5,
    color: bio.alpha(0.72),
  },

  error: {
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.color.coralLt,
    marginTop: 14,
  },

  cta: {
    height: 52,
    borderRadius: 15,
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: bio.blueAlpha(0.16),
    borderWidth: 1,
    borderColor: bio.blueAlpha(0.44),
  },
  ctaOff: { opacity: 0.6 },
  ctaText: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.blueLt },
  cancel: { alignItems: "center", paddingVertical: 14 },
  cancelText: { fontFamily: fontFamily.medium, fontSize: 13.5, color: bio.alpha(0.5) },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
