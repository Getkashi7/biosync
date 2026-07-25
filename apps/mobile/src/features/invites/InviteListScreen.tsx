/**
 * Invitations list (staff, §13 2A/2B).
 *
 * Codes are never shown here — they can't be. The row carries state, audience
 * and age instead, and revoking confirms in place rather than in a modal, so
 * the row you're acting on stays visible while you decide.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic, successHaptic } from "../../lib/haptics";
import { fetchInvites, revokeInvite, type InviteSummary } from "./invitesApi";

type Props = {
  onBack: () => void;
  onCreate: () => void;
  /** bumped by the parent after a new invite is minted */
  refreshKey?: number;
};

const STATE_LABEL: Record<InviteSummary["state"], string> = {
  active: "Active",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
};

/** "2h ago" / "4d ago" — coarse on purpose; exact times aren't useful here. */
function ago(at: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - at.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function InviteListScreen({ onBack, onCreate, refreshKey = 0 }: Props) {
  const insets = useSafeAreaInsets();
  const [invites, setInvites] = useState<InviteSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchInvites();
      setInvites(res.invites);
      setFailed(false);
    } catch {
      // A failure is NOT an empty list — saying "no invitations yet" here would
      // be a lie, and the trainer might mint a duplicate because of it.
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

  const doRevoke = useCallback(
    async (id: string) => {
      setConfirmId(null);
      try {
        await revokeInvite(id);
        successHaptic();
        await load();
      } catch {
        setFailed(true);
      }
    },
    [load],
  );

  const activeCount = invites?.filter((i) => i.state === "active").length ?? 0;

  return (
    <View style={styles.root}>
      <StaticBloom />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />
        }
      >
        <ScreenHeader
          title="Invitations"
          label="Trainer · Clients"
          onBack={onBack}
          right={
            <View style={styles.headRight}>
              <View style={styles.countBlock}>
                <Text style={styles.count}>{activeCount}</Text>
                <Text style={styles.countLabel}>ACTIVE</Text>
              </View>
              <Pressable
                onPress={() => {
                  pressHaptic();
                  onCreate();
                }}
                style={styles.plus}
                accessibilityRole="button"
                accessibilityLabel="New invitation"
              >
                <View style={styles.plusV} />
                <View style={styles.plusH} />
              </Pressable>
            </View>
          }
        />

        <Text style={styles.lede}>
          Codes are never shown here — each one is visible once, at creation.
        </Text>

        {invites === null && !failed ? (
          <View style={styles.centre}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : failed ? (
          <View style={styles.centre}>
            <Text style={styles.emptyTitle}>Couldn't load invitations</Text>
            <Text style={styles.emptyBody}>Check your connection and pull down to try again.</Text>
          </View>
        ) : invites && invites.length === 0 ? (
          <View style={styles.centre}>
            <Text style={styles.emptyTitle}>No invitations yet</Text>
            <Text style={styles.emptyBody}>
              Create one and share the code — your client redeems it in their app.
            </Text>
            <Pressable
              onPress={() => {
                pressHaptic();
                onCreate();
              }}
              style={styles.emptyCta}
              accessibilityRole="button"
              accessibilityLabel="New invitation"
            >
              <Text style={styles.emptyCtaText}>New invitation</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.listHead}>
              <Text style={styles.listHeadLabel}>NEWEST FIRST</Text>
              <Text style={styles.listHeadCount}>{invites?.length ?? 0}</Text>
            </View>
            {invites?.map((inv) => (
              <Row
                key={inv.id}
                invite={inv}
                confirming={confirmId === inv.id}
                onAsk={() => {
                  pressHaptic();
                  setConfirmId(inv.id);
                }}
                onKeep={() => setConfirmId(null)}
                onRevoke={() => void doRevoke(inv.id)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({
  invite,
  confirming,
  onAsk,
  onKeep,
  onRevoke,
}: {
  invite: InviteSummary;
  confirming: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onRevoke: () => void;
}) {
  const dim = invite.state === "expired" || invite.state === "revoked";
  const capacity = invite.kind === "PT" ? "Trainer invite" : "Practitioner invite";
  const audience = invite.email ? `Locked to ${invite.email}` : "Anyone with the code";
  const who = invite.state === "accepted" && invite.acceptedBy ? `${invite.acceptedBy} · ` : "";
  const meta = `${who}${audience} · ${ago(new Date(invite.createdAt))}`;

  if (confirming) {
    return (
      <View style={styles.row}>
        <View style={styles.confirm}>
          <Text style={styles.confirmTitle}>Revoke this code?</Text>
          <Text style={styles.confirmBody}>It stops working immediately. This can't be undone.</Text>
          <View style={styles.confirmBtns}>
            <Pressable
              onPress={onRevoke}
              style={styles.revokeBtn}
              accessibilityRole="button"
              accessibilityLabel="Confirm revoke"
            >
              <Text style={styles.revokeBtnText}>Revoke</Text>
            </Pressable>
            <Pressable onPress={onKeep} style={styles.keepBtn} accessibilityRole="button" accessibilityLabel="Keep code">
              <Text style={styles.keepBtnText}>Keep</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, dim && styles.rowDim]}>
      <View style={styles.rowInner}>
        <View style={styles.flex}>
          <Text style={styles.cap}>{capacity}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View style={styles.stateBlock}>
          <View style={styles.stateLine}>
            {invite.state === "active" ? <View style={styles.stateDot} /> : null}
            <Text
              style={[
                styles.stateText,
                invite.state === "active"
                  ? styles.stateActive
                  : invite.state === "accepted"
                    ? styles.stateAccepted
                    : styles.stateDim,
              ]}
            >
              {STATE_LABEL[invite.state]}
            </Text>
          </View>
        </View>
        {invite.state === "active" ? (
          <Pressable
            onPress={onAsk}
            style={styles.revokeChip}
            accessibilityRole="button"
            accessibilityLabel="Revoke invitation"
          >
            <Text style={styles.revokeChipText}>Revoke</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 20, flexGrow: 1 },

  headRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  countBlock: { alignItems: "flex-end" },
  count: { fontFamily: fontFamily.dot, fontSize: 30, color: bio.color.teal, lineHeight: 32 },
  countLabel: { fontFamily: fontFamily.semibold, fontSize: 9.5, letterSpacing: 1.33, color: bio.alpha(0.4), marginTop: 2 },
  plus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.45),
    backgroundColor: bio.tealAlpha(0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  plusV: { position: "absolute", width: 1.8, height: 13, borderRadius: 2, backgroundColor: bio.color.teal },
  plusH: { position: "absolute", width: 13, height: 1.8, borderRadius: 2, backgroundColor: bio.color.teal },

  lede: { fontFamily: fontFamily.light, fontSize: 12.5, lineHeight: 19.4, color: bio.alpha(0.6), marginTop: 12 },

  listHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 18,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.08),
  },
  listHeadLabel: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.76, color: bio.alpha(0.45) },
  listHeadCount: { fontFamily: fontFamily.dotBold, fontSize: 13, color: bio.alpha(0.5) },

  row: { borderBottomWidth: 1, borderBottomColor: bio.alpha(0.06) },
  rowDim: { opacity: 0.55 },
  rowInner: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 6 },
  cap: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.text },
  meta: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.45), marginTop: 3 },
  stateBlock: { alignItems: "flex-end" },
  stateLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  stateDot: { width: bio.invite.dot, height: bio.invite.dot, borderRadius: bio.invite.dot, backgroundColor: bio.color.teal },
  stateText: { fontFamily: fontFamily.semibold, fontSize: 12 },
  stateActive: { color: bio.color.teal },
  stateAccepted: { color: bio.alpha(0.85) },
  stateDim: { color: bio.alpha(0.4) },
  revokeChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: bio.color.border,
  },
  revokeChipText: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: bio.alpha(0.7) },

  confirm: { paddingVertical: 14, paddingHorizontal: 6 },
  confirmTitle: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.text },
  confirmBody: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.55), marginTop: 3 },
  confirmBtns: { flexDirection: "row", gap: 8, marginTop: 11 },
  revokeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: bio.alpha(0.25),
  },
  revokeBtnText: { fontFamily: fontFamily.bold, fontSize: 12, color: bio.color.text },
  keepBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  keepBtnText: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.alpha(0.6) },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.text },
  emptyBody: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 19.4,
    color: bio.alpha(0.55),
    textAlign: "center",
    maxWidth: 280,
    marginTop: 8,
  },
  emptyCta: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.45),
    backgroundColor: bio.tealAlpha(0.1),
  },
  emptyCtaText: { fontFamily: fontFamily.bold, fontSize: 13, color: bio.color.teal },
});
