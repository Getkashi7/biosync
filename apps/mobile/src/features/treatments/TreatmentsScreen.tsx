/**
 * §7 Treatments — the client's view.
 *
 * The screen is built around one rule: nothing here may read as a booking.
 * A suggestion is an invitation to ask; a request is a question awaiting an
 * answer; an approval is permission that lapses. Each of those is a distinct
 * visual state, and the copy for all of them lives in `lib/treatmentCopy.ts`
 * beside the disclaimer, so wording that carries regulatory weight is not
 * scattered through JSX.
 *
 * Every reason string was computed by the server from the user's own readings.
 * There is no model in this path, and the screen never adds a sentence about
 * what a treatment would do.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import {
  CLINIC_BOOKING_URL,
  TREATMENT_DISCLAIMER,
  TREATMENT_PENDING_NOTE,
  bookingNote,
  canOpenClinic,
  canWithdraw,
  statusBody,
  statusLabel,
  statusTone,
  type StatusTone,
} from "../../lib/treatmentCopy";
import {
  fetchRequests,
  fetchSuggestions,
  withdrawRequest,
  type Suggestion,
  type TreatmentRequest,
} from "./treatmentsApi";
import { TreatmentRequestSheet } from "./TreatmentRequestSheet";

const TONE_COLOR: Record<StatusTone, string> = {
  pending: bio.color.amber,
  approved: bio.color.teal,
  closed: bio.alpha(0.32),
};

export function TreatmentsScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [hasPractitioner, setHasPractitioner] = useState(false);
  const [requests, setRequests] = useState<TreatmentRequest[] | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [asking, setAsking] = useState<Suggestion | null>(null);

  /**
   * Reloads can overlap — sending a request reloads, and so does withdrawing
   * one, and nothing stops the user doing both inside a second. Whichever
   * response lands last would win, which is not the same as the newest one
   * winning: an earlier read that was slower would quietly put the old list
   * back, and this screen's whole job is telling someone the current state of
   * a request a clinician has to act on. So each load takes a number and only
   * the newest is allowed to write, and a response that arrives after the
   * screen has gone writes nothing at all.
   */
  const loadSeq = useRef(0);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const current = () => mounted.current && seq === loadSeq.current;
    setFailed(null);
    try {
      const [s, r] = await Promise.all([fetchSuggestions(), fetchRequests()]);
      if (!current()) return;
      setSuggestions(s.suggestions);
      setHasPractitioner(s.hasPractitioner);
      setRequests(r);
    } catch (e) {
      if (!current()) return;
      setFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onWithdraw = async (id: string) => {
    pressHaptic();
    try {
      await withdrawRequest(id);
      await load();
    } catch {
      // The row is still on screen and still says what it said. Reloading would
      // be the lie here — pretending the withdrawal landed when it didn't.
      await load();
    }
  };

  const body = (): React.ReactNode => {
    // Never an empty state for a failed request — "you've asked for nothing"
    // and "we couldn't reach the server" are different claims.
    if (failed) return <LoadFailed what="your treatments" kind={failed} onRetry={() => void load()} />;
    if (suggestions === null || requests === null) {
      return (
        <View style={styles.centre}>
          <Spinner tint={bio.color.text} />
        </View>
      );
    }

    return (
      <>
        {requests.length > 0 ? (
          <View style={styles.pendingBand}>
            <Text style={styles.pendingText}>{TREATMENT_PENDING_NOTE}</Text>
          </View>
        ) : (
          <View style={styles.disclaimer}>
            <View style={styles.disclaimerIcon}>
              <Svg width={13} height={15} viewBox="0 0 13 15" fill="none">
                <Path
                  d="M6.5 1 L12 3 V7.6 C12 11 9.4 13.2 6.5 14 C3.6 13.2 1 11 1 7.6 V3 Z"
                  stroke={bio.color.blue}
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <Text style={styles.disclaimerText}>{TREATMENT_DISCLAIMER}</Text>
          </View>
        )}

        {suggestions.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>FROM YOUR READINGS</Text>
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.slug}
                suggestion={s}
                canAsk={hasPractitioner}
                onAsk={() => {
                  pressHaptic();
                  setAsking(s);
                }}
              />
            ))}
          </>
        ) : (
          <NothingSuggested hasAny={requests.length > 0} />
        )}

        {!hasPractitioner ? <NoPractitioner /> : null}

        {requests.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>YOUR REQUESTS</Text>
            {requests.map((r) => (
              <RequestRow key={r.id} request={r} onWithdraw={() => void onWithdraw(r.id)} />
            ))}
          </>
        ) : null}
      </>
    );
  };

  return (
    <View style={styles.root}>
      <StaticBloom color={bio.color.blue} opacity={0.05} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              pressHaptic();
              onBack();
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Svg width={10} height={10} viewBox="0 0 10 10" fill="none">
              <Path
                d="M6.5 1 L2.5 5 L6.5 9"
                stroke={bio.alpha(0.8)}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title}>Treatments</Text>
            <Text style={styles.subtitle}>REVIEWED BY BIOMEDS</Text>
          </View>
        </View>

        {body()}
      </ScrollView>

      {asking ? (
        <TreatmentRequestSheet
          suggestion={asking}
          onClose={() => setAsking(null)}
          onDone={() => {
            setAsking(null);
            void load();
          }}
        />
      ) : null}
    </View>
  );
}

function SuggestionCard({
  suggestion,
  canAsk,
  onAsk,
}: {
  suggestion: Suggestion;
  canAsk: boolean;
  onAsk: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.plate}>
          <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
            <Path
              d="M8 2.5 V13.5 M2.5 8 H13.5"
              stroke={bio.color.blue}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </Svg>
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{suggestion.name}</Text>
          {/* The server computed this from the user's own log. It restates; it
              never recommends. */}
          <Text style={styles.cardReason}>{suggestion.reason}</Text>
        </View>
      </View>

      <Text style={styles.cardSummary}>{suggestion.summary}</Text>

      <Pressable
        onPress={canAsk ? onAsk : undefined}
        disabled={!canAsk}
        style={({ pressed }) => [
          styles.askBtn,
          !canAsk && styles.askBtnOff,
          pressed && canAsk && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Ask Biomeds about ${suggestion.name}`}
      >
        <Text style={[styles.askText, !canAsk && styles.askTextOff]}>Ask Biomeds</Text>
      </Pressable>
    </View>
  );
}

function RequestRow({
  request,
  onWithdraw,
}: {
  request: TreatmentRequest;
  onWithdraw: () => void;
}) {
  const tone = statusTone(request.status);
  const colour = TONE_COLOR[tone];

  return (
    <View style={styles.requestRow}>
      <View style={styles.requestHead}>
        {/* Pending is a hollow ring, approved is a filled dot. Colour alone
            would leave the two indistinguishable to a colour-blind reader, and
            "awaiting review" reading as "booked" is the one confusion this
            feature cannot afford. */}
        <View
          style={[
            styles.dot,
            { borderColor: colour },
            tone === "approved" && { backgroundColor: colour },
          ]}
        />
        <Text style={styles.requestName}>{request.name}</Text>
        <Text style={[styles.requestStatus, { color: colour }]}>{statusLabel(request.status)}</Text>
      </View>

      <Text style={styles.requestBody}>{statusBody(request.status, request.expiresInDays)}</Text>

      {request.decisionNote ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>FROM BIOMEDS</Text>
          <Text style={styles.noteText}>{request.decisionNote}</Text>
        </View>
      ) : null}

      {/*
        `canBook` is the server's answer from `canProceedToBooking` — never
        `status === "APPROVED"`, which is also true of a lapsed approval. The
        hand-off is unreachable before a practitioner has looked, by
        construction: this whole block only renders once canBook is true.
      */}
      {request.canBook ? (
        <>
          <Text style={styles.bookNote}>{bookingNote(request.canBook)}</Text>
          {canOpenClinic(request.canBook) ? (
            <Pressable
              onPress={() => {
                pressHaptic();
                void Linking.openURL(CLINIC_BOOKING_URL);
              }}
              style={({ pressed }) => [styles.bookBtn, pressed && styles.pressed]}
              accessibilityRole="link"
              accessibilityLabel={`Book ${request.name} at the clinic`}
            >
              <Text style={styles.bookBtnText}>Book at the clinic</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {canWithdraw(request.status) ? (
        <Pressable
          onPress={onWithdraw}
          style={({ pressed }) => [styles.withdraw, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.withdrawText}>Withdraw</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Nothing surfaced. Said as a good thing, not as an empty shelf. */
function NothingSuggested({ hasAny }: { hasAny: boolean }) {
  return (
    <View style={styles.quietBlock}>
      <Text style={styles.quietTitle}>Nothing to suggest right now.</Text>
      <Text style={styles.quietBody}>
        {hasAny
          ? "Your recent readings don't point at anything new. That's a good sign."
          : "Suggestions appear here only when your own check-ins point at something worth asking about. Keep logging and we'll tell you if that changes."}
      </Text>
    </View>
  );
}

/**
 * No practitioner. Shown rather than hidden, because the alternative is a
 * button that fails when pressed — the API refuses the request outright.
 */
function NoPractitioner() {
  return (
    <View style={styles.noPractitioner}>
      <Text style={styles.noPractitionerTitle}>You're not connected to Biomeds.</Text>
      <Text style={styles.quietBody}>
        Requests are read and decided by the Biomeds doctor, so you'll need to be connected to
        Biomeds before you can ask. Your PT can't review these.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, flexGrow: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },

  header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 20 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.06),
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fontFamily.bold, fontSize: 21, letterSpacing: -0.21, color: bio.color.text },
  subtitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.47,
    color: bio.alpha(0.45),
    marginTop: 3,
  },

  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: bio.treatment.disclaimerRadius,
    backgroundColor: bio.blueAlpha(0.07),
    borderWidth: 1,
    borderColor: bio.blueAlpha(0.24),
  },
  disclaimerIcon: { paddingTop: 1 },
  disclaimerText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.alpha(0.82),
  },
  pendingBand: {
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: bio.treatment.disclaimerRadius,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.11),
  },
  pendingText: {
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.alpha(0.72),
  },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 24,
    marginBottom: 10,
  },

  card: {
    borderRadius: bio.treatment.cardRadius,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    padding: 15,
    marginBottom: 10,
  },
  cardHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  plate: {
    width: bio.treatment.plate,
    height: bio.treatment.plate,
    borderRadius: 12,
    backgroundColor: bio.blueAlpha(0.1),
    borderWidth: 1,
    borderColor: bio.blueAlpha(0.28),
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: 15.5, color: bio.color.text },
  cardReason: {
    fontFamily: fontFamily.light,
    fontSize: 12,
    lineHeight: 17,
    color: bio.color.blueLt,
    marginTop: 3,
  },
  cardSummary: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.alpha(0.55),
    marginTop: 11,
  },
  askBtn: {
    height: 44,
    borderRadius: 14,
    marginTop: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: bio.blueAlpha(0.14),
    borderWidth: 1,
    borderColor: bio.blueAlpha(0.4),
  },
  askBtnOff: { backgroundColor: bio.alpha(0.04), borderColor: bio.alpha(0.1) },
  askText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.blueLt },
  askTextOff: { color: bio.alpha(0.32) },

  requestRow: {
    borderRadius: 18,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.alpha(0.09),
    padding: 14,
    marginBottom: 10,
  },
  requestHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: {
    width: bio.treatment.dot,
    height: bio.treatment.dot,
    borderRadius: bio.treatment.dot / 2,
    borderWidth: 1.5,
  },
  requestName: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.text },
  requestStatus: { fontFamily: fontFamily.semibold, fontSize: 11.5 },
  requestBody: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.alpha(0.55),
    marginTop: 8,
  },
  noteBox: {
    marginTop: 11,
    padding: 11,
    borderRadius: bio.radius.xs,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.09),
  },
  noteLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 9.5,
    letterSpacing: 1.2,
    color: bio.alpha(0.4),
  },
  noteText: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.alpha(0.78),
    marginTop: 5,
  },
  bookNote: {
    fontFamily: fontFamily.light,
    fontSize: 12,
    lineHeight: 17,
    color: bio.tealAlpha(0.85),
    marginTop: 9,
  },
  bookBtn: {
    height: 44,
    borderRadius: 14,
    marginTop: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: bio.tealAlpha(0.14),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.4),
  },
  bookBtnText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.teal },
  withdraw: { alignSelf: "flex-start", marginTop: 11, paddingVertical: 5 },
  withdrawText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.alpha(0.5) },

  quietBlock: { marginTop: 26 },
  quietTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.text },
  quietBody: {
    fontFamily: fontFamily.light,
    fontSize: 13,
    lineHeight: 20,
    color: bio.alpha(0.55),
    marginTop: 7,
  },

  noPractitioner: {
    marginTop: 22,
    padding: 14,
    borderRadius: bio.radius.sm,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  noPractitionerTitle: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.alpha(0.88) },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
