/**
 * The practitioner's approvals queue — design 5B, "IV & treatments".
 *
 * Violet staff register, not the client's blue: this is the §9 surface, and the
 * design's own rule is that staff screens read as someone else's window into a
 * client, never as the client's own app.
 *
 * Only a PRACTITIONER capability reaches this screen. The API refuses a PT
 * outright and `MainTabs` withholds the entry point from one — duplicated on
 * purpose, because hiding a button is presentation and presentation is not
 * access control.
 *
 * Two things the design settles that a sheet would have got wrong:
 *
 * - **Declining happens ON the card.** The reason field expands in place, under
 *   the request it refuses, so the practitioner is looking at what they are
 *   declining while they write. A modal would cover it.
 * - **A decided card stays put**, turning into its approved/declined chip
 *   rather than vanishing. Work you just did should not disappear — and the
 *   declined card then shows the reason back to you, as the client will read it.
 *
 * What a card shows is deliberately narrow. The client asked this question and
 * that is the permission being exercised, so the card carries the frozen reason
 * they already saw and their own note — never their wider record.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { initials } from "../../lib/format";
import {
  MIN_DECLINE_REASON,
  TREATMENT_QUEUE_DISCLAIMER,
  TREATMENT_QUEUE_LEAD,
  relativeDay,
} from "../../lib/treatmentCopy";
import {
  approveRequest,
  declineRequest,
  fetchReviewQueue,
  type ReviewItem,
} from "./treatmentsApi";

/** What has happened to a card since the queue loaded. */
type CardState =
  | { kind: "pending" }
  | { kind: "declining"; reason: string }
  | { kind: "saving" }
  | { kind: "approved" }
  | { kind: "declined"; reason: string }
  | { kind: "failed"; message: string };

function messageFor(err: unknown): string {
  const code = (err as { data?: { code?: string } })?.data?.code;
  if (code === "PRECONDITION_FAILED") return "Already decided — someone got there first.";
  if (code === "NOT_FOUND") return "This request is no longer available to you.";
  return classifyNetError(err) === "offline"
    ? "You look offline. Nothing was saved."
    : "Something went wrong on our end. Nothing was saved.";
}

export function ReviewQueueScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setItems(await fetchReviewQueue());
      setCards({});
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stateOf = (id: string): CardState => cards[id] ?? { kind: "pending" };
  const patch = (id: string, next: CardState) => setCards((c) => ({ ...c, [id]: next }));

  const approve = async (item: ReviewItem) => {
    pressHaptic();
    patch(item.id, { kind: "saving" });
    try {
      await approveRequest(item.id);
      patch(item.id, { kind: "approved" });
    } catch (e) {
      patch(item.id, { kind: "failed", message: messageFor(e) });
    }
  };

  const confirmDecline = async (item: ReviewItem, reason: string) => {
    pressHaptic();
    patch(item.id, { kind: "saving" });
    try {
      await declineRequest(item.id, reason.trim());
      patch(item.id, { kind: "declined", reason: reason.trim() });
    } catch (e) {
      patch(item.id, { kind: "failed", message: messageFor(e) });
    }
  };

  /** Still waiting on this practitioner — what the Doto count reports. */
  const pendingCount =
    items?.filter((i) => {
      const k = stateOf(i.id).kind;
      return k === "pending" || k === "declining" || k === "saving" || k === "failed";
    }).length ?? 0;

  const body = (): React.ReactNode => {
    if (failed) {
      return <LoadFailed what="your review queue" kind={failed} onRetry={() => void load()} />;
    }
    if (items === null) {
      return (
        <View style={styles.centre}>
          <Spinner tint={bio.color.text} />
        </View>
      );
    }
    if (items.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing waiting on you.</Text>
          <Text style={styles.emptyBody}>
            Requests appear here when one of your clients asks for a treatment review. They see
            "awaiting review" until you decide, so nothing is booked in the meantime.
          </Text>
        </View>
      );
    }
    return (
      <>
        <Text style={styles.sectionLabel}>AWAITING YOU</Text>
        <View style={styles.cards}>
          {items.map((item) => (
            <QueueCard
              key={item.id}
              item={item}
              state={stateOf(item.id)}
              onApprove={() => void approve(item)}
              onStartDecline={() => {
                pressHaptic();
                patch(item.id, { kind: "declining", reason: "" });
              }}
              onReason={(reason) => patch(item.id, { kind: "declining", reason })}
              onCancel={() => {
                pressHaptic();
                patch(item.id, { kind: "pending" });
              }}
              onConfirmDecline={(reason) => void confirmDecline(item, reason)}
              onRetry={() => patch(item.id, { kind: "pending" })}
            />
          ))}
        </View>
      </>
    );
  };

  return (
    <View style={styles.root}>
      <StaticBloom color={bio.color.violet} opacity={0.05} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
            <Text style={styles.eyebrow}>BIOMEDS · APPROVALS</Text>
            <Text style={styles.title}>IV &amp; treatments</Text>
          </View>
          <View style={styles.countBlock}>
            <Text style={styles.count}>{pendingCount}</Text>
            <Text style={styles.countLabel}>PENDING</Text>
          </View>
        </View>

        <Text style={styles.lead}>{TREATMENT_QUEUE_LEAD}</Text>

        {body()}

        <View style={styles.logNote}>
          <Svg width={13} height={15} viewBox="0 0 13 15" fill="none">
            <Path
              d="M2.2 6.4 V4.2 a4.3 4.3 0 0 1 8.6 0 V6.4"
              stroke={bio.alpha(0.4)}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <Path
              d="M1.4 6.4 h10.2 v7.2 H1.4 z"
              stroke={bio.alpha(0.4)}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.logNoteText}>
            Every decision is logged and visible to the client and clinic.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function QueueCard({
  item,
  state,
  onApprove,
  onStartDecline,
  onReason,
  onCancel,
  onConfirmDecline,
  onRetry,
}: {
  item: ReviewItem;
  state: CardState;
  onApprove: () => void;
  onStartDecline: () => void;
  onReason: (reason: string) => void;
  onCancel: () => void;
  onConfirmDecline: (reason: string) => void;
  onRetry: () => void;
}) {
  const first = item.clientName.split(" ")[0] ?? item.clientName;
  const asked = new Date(item.createdAt);
  const chip = chipFor(state);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.clientName)}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.clientName} numberOfLines={1}>
            {item.clientName}
          </Text>
          <Text style={styles.when}>Requested {relativeDay(asked)}</Text>
        </View>
        <View style={[styles.chip, chip.wrap]}>
          <View style={[styles.chipDot, chip.dot]} />
          <Text style={[styles.chipText, chip.text]}>{chip.label}</Text>
        </View>
      </View>

      <Text style={styles.protocol}>{item.name}</Text>

      {/*
        The design's meta line carries a clinic and a slot. We store neither —
        BIOSYNC never books, so there is no appointment to name yet. What we do
        have is the reason the client was shown when they asked, which is what
        the decision is actually being made against.
      */}
      <Text style={styles.meta}>
        {state.kind === "declined" ? `Reason shared with ${first}: "${state.reason}"` : item.reason}
      </Text>

      {item.note && state.kind !== "declined" ? (
        <View style={styles.noteBox}>
          <Text style={styles.microLabel}>THEIR NOTE</Text>
          <Text style={styles.noteText}>{item.note}</Text>
        </View>
      ) : null}

      {state.kind === "pending" || state.kind === "saving" ? (
        <View style={styles.actions}>
          <Pressable
            onPress={state.kind === "saving" ? undefined : onStartDecline}
            disabled={state.kind === "saving"}
            style={({ pressed }) => [
              styles.action,
              styles.ghost,
              pressed && state.kind !== "saving" && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Decline ${item.name} for ${item.clientName}`}
          >
            <Text style={styles.ghostText}>Decline</Text>
          </Pressable>
          <Pressable
            onPress={state.kind === "saving" ? undefined : onApprove}
            disabled={state.kind === "saving"}
            style={({ pressed }) => [
              styles.action,
              styles.approve,
              state.kind === "saving" && styles.dim,
              pressed && state.kind !== "saving" && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Approve ${item.name} for ${item.clientName}`}
          >
            <Text style={styles.approveText}>
              {state.kind === "saving" ? "Saving…" : "Approve"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {state.kind === "declining" ? (
        <DeclineForm
          first={first}
          reason={state.reason}
          onReason={onReason}
          onCancel={onCancel}
          onConfirm={() => onConfirmDecline(state.reason)}
        />
      ) : null}

      {state.kind === "failed" ? (
        <View style={styles.failRow}>
          <Text style={styles.failText}>{state.message}</Text>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.cardFooter}>{TREATMENT_QUEUE_DISCLAIMER}</Text>
    </View>
  );
}

/** The in-card decline form. Confirm waits until the reason is long enough. */
function DeclineForm({
  first,
  reason,
  onReason,
  onCancel,
  onConfirm,
}: {
  first: string;
  reason: string;
  onReason: (r: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const short = reason.trim().length < MIN_DECLINE_REASON;
  const remaining = MIN_DECLINE_REASON - reason.trim().length;

  return (
    <View style={styles.declineWrap}>
      <Text style={styles.microLabel}>REASON · REQUIRED, SHARED WITH {first.toUpperCase()}</Text>
      <TextInput
        style={styles.reasonInput}
        value={reason}
        onChangeText={onReason}
        placeholder="e.g. Not suitable alongside your current supplement protocol — let's talk first."
        placeholderTextColor={bio.alpha(0.35)}
        multiline
        maxLength={500}
        autoFocus
      />
      {short ? (
        <Text style={styles.hint}>
          {reason.trim().length === 0
            ? "A reason is required — it is shared with your client."
            : `${remaining} more character${remaining === 1 ? "" : "s"}.`}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [styles.action, styles.ghost, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={short ? undefined : onConfirm}
          disabled={short}
          style={({ pressed }) => [
            styles.action,
            short ? styles.confirmOff : styles.confirmOn,
            pressed && !short && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={short ? styles.confirmTextOff : styles.confirmTextOn}>Confirm decline</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The status chip. Pending is a hollow ring on neutral ink; only a real
 * decision earns colour, and declined is the one place coral appears — the
 * design reserves it for destructive outcomes, never for failure states.
 */
function chipFor(state: CardState): {
  label: string;
  wrap: object;
  dot: object;
  text: object;
} {
  if (state.kind === "approved") {
    return {
      label: "Approved · logged",
      wrap: { backgroundColor: bio.violetAlpha(0.12), borderColor: bio.violetAlpha(0.4) },
      dot: { backgroundColor: bio.color.violet, borderColor: bio.color.violet },
      text: { color: bio.color.violetChipText },
    };
  }
  if (state.kind === "declined") {
    return {
      label: "Declined · logged",
      wrap: { backgroundColor: bio.coralAlpha(0.08), borderColor: bio.coralAlpha(0.35) },
      dot: { backgroundColor: bio.color.coral, borderColor: bio.color.coral },
      text: { color: bio.color.coralLt },
    };
  }
  return {
    label: "Awaiting your decision",
    wrap: { backgroundColor: bio.alpha(0.04), borderColor: bio.alpha(0.16) },
    dot: { borderColor: bio.alpha(0.5) },
    text: { color: bio.alpha(0.65) },
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, flexGrow: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },

  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
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
  eyebrow: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.68,
    color: bio.alpha(0.45),
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 23,
    letterSpacing: -0.345,
    color: bio.color.text,
    marginTop: 5,
  },
  countBlock: { alignItems: "flex-end" },
  count: {
    fontFamily: fontFamily.dot,
    fontSize: bio.treatment.queue.count,
    lineHeight: bio.treatment.queue.count,
    color: bio.color.violet,
  },
  countLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 9.5,
    letterSpacing: 1.33,
    color: bio.alpha(0.4),
    marginTop: 4,
  },

  lead: {
    fontFamily: fontFamily.light,
    fontSize: 12,
    lineHeight: 18.6,
    color: bio.alpha(0.5),
    marginTop: 12,
    paddingHorizontal: 2,
  },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 20,
    marginBottom: 10,
  },
  cards: { gap: 12 },

  card: {
    borderRadius: bio.treatment.cardRadius,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    padding: 16,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: {
    width: bio.treatment.queue.avatar,
    height: bio.treatment.queue.avatar,
    borderRadius: bio.treatment.queue.avatar / 2,
    backgroundColor: bio.alpha(0.06),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: bio.alpha(0.8) },
  clientName: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.text },
  when: {
    fontFamily: fontFamily.light,
    fontSize: 10.5,
    color: bio.alpha(0.45),
    marginTop: 2,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
  },
  chipDot: {
    width: bio.treatment.queue.chipDot,
    height: bio.treatment.queue.chipDot,
    borderRadius: bio.treatment.queue.chipDot / 2,
    borderWidth: 1,
  },
  chipText: { fontFamily: fontFamily.semibold, fontSize: 9.5, letterSpacing: 0.57 },

  protocol: {
    fontFamily: fontFamily.bold,
    fontSize: 15.5,
    letterSpacing: -0.155,
    color: bio.color.text,
    marginTop: 13,
  },
  meta: {
    fontFamily: fontFamily.light,
    fontSize: 11.5,
    lineHeight: 17,
    color: bio.alpha(0.5),
    marginTop: 4,
  },

  microLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.26,
    color: bio.alpha(0.5),
  },
  noteBox: {
    marginTop: 11,
    padding: 11,
    borderRadius: bio.radius.xs,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.09),
  },
  noteText: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.alpha(0.8),
    marginTop: 5,
  },

  actions: { flexDirection: "row", gap: 9, marginTop: 14 },
  action: {
    flex: 1,
    height: bio.treatment.queue.action,
    borderRadius: bio.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dim: { opacity: 0.6 },
  ghost: { backgroundColor: bio.alpha(0.05), borderWidth: 1, borderColor: bio.alpha(0.14) },
  ghostText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.alpha(0.8) },
  approve: { backgroundColor: bio.color.violet },
  approveText: { fontFamily: fontFamily.bold, fontSize: 13.5, color: bio.color.ink },

  declineWrap: { marginTop: 14 },
  reasonInput: {
    height: bio.treatment.queue.reasonBox,
    marginTop: 8,
    borderRadius: bio.treatment.queue.reasonRadius,
    backgroundColor: bio.alpha(0.045),
    borderWidth: 1,
    borderColor: bio.alpha(0.14),
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19.5,
    color: bio.color.text,
    textAlignVertical: "top",
  },
  hint: { fontFamily: fontFamily.light, fontSize: 11, color: bio.alpha(0.42), marginTop: 7 },
  confirmOn: { backgroundColor: bio.color.coral },
  confirmTextOn: { fontFamily: fontFamily.bold, fontSize: 13.5, color: bio.color.ink },
  confirmOff: { backgroundColor: bio.coralAlpha(0.12) },
  confirmTextOff: { fontFamily: fontFamily.bold, fontSize: 13.5, color: "rgba(255,180,172,0.45)" },

  failRow: { marginTop: 13 },
  failText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    color: bio.color.coralLt,
  },
  retry: { alignSelf: "flex-start", marginTop: 7, paddingVertical: 4 },
  retryText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.alpha(0.7) },

  cardFooter: {
    fontFamily: fontFamily.light,
    fontSize: 10,
    lineHeight: 15,
    color: bio.alpha(0.38),
    marginTop: 13,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: bio.alpha(0.07),
  },

  logNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  logNoteText: {
    flex: 1,
    fontFamily: fontFamily.light,
    fontSize: 11,
    lineHeight: 16.5,
    color: bio.alpha(0.4),
  },

  empty: { marginTop: 30 },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 17, color: bio.color.text },
  emptyBody: {
    fontFamily: fontFamily.light,
    fontSize: 13,
    lineHeight: 20,
    color: bio.alpha(0.55),
    marginTop: 8,
  },

  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
