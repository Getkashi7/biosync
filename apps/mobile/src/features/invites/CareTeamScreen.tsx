/**
 * My care team (client, §13 6A/6B).
 *
 * The client's view of who they're connected to, and the only place they can
 * end a connection. Disconnecting confirms in a sheet that states the real
 * consequence — access stops now, but the plans and notes a trainer already
 * wrote stay — because the honest version is more reassuring than a vague one.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, pressHaptic, successHaptic } from "../../lib/haptics";
import { dateLabel, initials } from "../../lib/format";
import { disconnectStaff, fetchCareTeam, kindNoun, type CareTeamMember } from "./invitesApi";
import { fetchTrainerFeed } from "../mytrainer/myTrainerApi";
import { FlatRow } from "../../ui/bio/FlatRow";

type Props = {
  onBack: () => void;
  onEnterCode: () => void;
  /**
   * What a trainer has shared — moved here from You by N2, next to the people
   * who wrote it. Shown only once something has been shared.
   */
  onTrainerFeed: () => void;
  /** bumped by the parent after a successful connection */
  refreshKey?: number;
};

const BLOBS = [
  {
    hue: bio.aurora.violet,
    size: 460,
    cx: true,
    top: -70,
    stops: [
      { o: 0, a: 0.32 },
      { o: 46, a: 0.1 },
      { o: 72, a: 0 },
    ],
    variant: "a" as const,
  },
  {
    hue: bio.aurora.blue,
    size: 300,
    right: -120,
    bottom: 150,
    stops: [
      { o: 0, a: 0.12 },
      { o: 70, a: 0 },
    ],
    variant: "b" as const,
    delayMs: -5000,
  },
];

export function CareTeamScreen({ onBack, onEnterCode, onTrainerFeed, refreshKey = 0 }: Props) {
  const [hasFeed, setHasFeed] = useState(false);
  useEffect(() => {
    void fetchTrainerFeed()
      .then((f) => setHasFeed(f.plans.length > 0 || f.notes.length > 0))
      .catch(() => {});
  }, [refreshKey]);
  const insets = useSafeAreaInsets();
  const [team, setTeam] = useState<CareTeamMember[] | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, setConfirm] = useState<CareTeamMember | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchCareTeam();
      setTeam(res.staff);
      setFailed(null);
    } catch (e) {
      // Never render a failure as "you're not connected to anyone" — that reads
      // as though a connection was lost.
      setFailed(classifyNetError(e));
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

  const doDisconnect = useCallback(async () => {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      await disconnectStaff(confirm.id);
      successHaptic();
      setConfirm(null);
      await load();
    } catch (e) {
      errorHaptic();
      setFailed(classifyNetError(e));
    } finally {
      setBusy(false);
    }
  }, [busy, confirm, load]);

  return (
    <View style={styles.root}>
      <AuroraField blobs={BLOBS} />

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
          title="My care team"
          label="Profile"
          onBack={onBack}
          right={
            <Pressable
              onPress={() => {
                pressHaptic();
                onEnterCode();
              }}
              style={styles.plus}
              accessibilityRole="button"
              accessibilityLabel="Enter a code"
            >
              <View style={styles.plusV} />
              <View style={styles.plusH} />
            </Pressable>
          }
        />

        <Text style={styles.lede}>
          They only see what you've chosen in <Text style={styles.ledeBold}>Who sees what</Text>.
        </Text>

        {team === null && !failed ? (
          <View style={styles.centre}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : failed ? (
          <View style={styles.centre}>
            <LoadFailed what="your care team" kind={failed ?? "offline"} onRetry={() => void load()} />
          </View>
        ) : team && team.length === 0 ? (
          <View style={styles.centre}>
            <Text style={styles.emptyTitle}>You're not connected to anyone</Text>
            <Text style={styles.emptyBody}>
              When you connect with your PT or Biomeds, they'll appear here.
            </Text>
            <Pressable
              onPress={() => {
                pressHaptic();
                onEnterCode();
              }}
              style={styles.emptyCta}
              accessibilityRole="button"
              accessibilityLabel="Enter a code"
            >
              <Text style={styles.emptyCtaText}>Enter a code</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {team?.map((m) => (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(m.name)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.name}>{m.name}</Text>
                    <Text style={styles.capacity}>
                      Your {m.kind ? kindNoun(m.kind) : "care provider"}
                    </Text>
                  </View>
                  <View style={styles.sinceBlock}>
                    <Text style={styles.sinceLabel}>SINCE</Text>
                    <Text style={styles.sinceValue}>{dateLabel(new Date(m.since))}</Text>
                  </View>
                </View>
                <View style={styles.cardFoot}>
                  <Pressable
                    onPress={() => {
                      pressHaptic();
                      setConfirm(m);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Disconnect ${m.name}`}
                  >
                    <Text style={styles.disconnect}>Disconnect</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {hasFeed ? (
              <View style={styles.feed}>
                <FlatRow label="From your PT" value="Plans & notes" onPress={onTrainerFeed} />
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {confirm ? (
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirm(null)} accessibilityLabel="Dismiss" />
          <View style={[styles.sheet, { marginBottom: insets.bottom + 24 }]}>
            <Text style={styles.sheetTitle}>Disconnect {confirm.name}?</Text>
            <Text style={styles.sheetBody}>
              They lose access to everything immediately. Plans and session notes they've already
              written stay with you.
            </Text>
            <Pressable
              onPress={() => {
                pressHaptic();
                setConfirm(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Keep connected"
            >
              <LinearGradient
                colors={[bio.color.violet, bio.color.violetDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.keepCta}
              >
                <Text style={styles.keepCtaText}>Keep connected</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => void doDisconnect()}
              disabled={busy}
              style={styles.destructive}
              accessibilityRole="button"
              accessibilityLabel="Confirm disconnect"
              accessibilityState={{ disabled: busy }}
            >
              <Text style={styles.destructiveText}>{busy ? "Disconnecting…" : "Disconnect"}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 22, flexGrow: 1 },

  plus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: bio.violetAlpha(0.45),
    backgroundColor: bio.violetAlpha(0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  plusV: { position: "absolute", width: 1.8, height: 13, borderRadius: 2, backgroundColor: bio.color.violetLt },
  plusH: { position: "absolute", width: 13, height: 1.8, borderRadius: 2, backgroundColor: bio.color.violetLt },

  lede: { fontFamily: fontFamily.light, fontSize: 12.5, lineHeight: 18.75, color: bio.alpha(0.62), marginTop: 14 },
  ledeBold: { fontFamily: fontFamily.semibold, color: bio.alpha(0.85) },

  list: { gap: 10, marginTop: 20 },
  feed: { marginTop: 6, borderTopWidth: 1, borderTopColor: bio.color.hairline },
  card: {
    borderRadius: 20,
    backgroundColor: bio.color.glassHi,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: {
    width: bio.invite.avatarRow,
    height: bio.invite.avatarRow,
    borderRadius: bio.invite.avatarRow / 2,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.alpha(0.85) },
  name: { fontFamily: fontFamily.semibold, fontSize: 15, letterSpacing: -0.15, color: bio.color.text },
  capacity: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.5), marginTop: 3 },
  sinceBlock: { alignItems: "flex-end" },
  sinceLabel: { fontFamily: fontFamily.semibold, fontSize: 9, letterSpacing: 1.26, color: bio.alpha(0.4) },
  sinceValue: { fontFamily: fontFamily.dotBold, fontSize: 13, color: bio.alpha(0.75), marginTop: 3 },
  cardFoot: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: bio.alpha(0.07),
  },
  disconnect: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.alpha(0.55) },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 70 },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: bio.color.text, textAlign: "center" },
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
    borderColor: bio.violetAlpha(0.45),
    backgroundColor: bio.violetAlpha(0.1),
  },
  emptyCtaText: { fontFamily: fontFamily.bold, fontSize: 13, color: bio.color.violetLt },

  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7,7,12,0.65)", justifyContent: "flex-end", padding: 20 },
  sheet: {
    borderRadius: 24,
    backgroundColor: bio.color.surface,
    borderWidth: 1,
    borderColor: bio.color.border,
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: 17, letterSpacing: -0.17, color: bio.color.text },
  sheetBody: { fontFamily: fontFamily.light, fontSize: 13, lineHeight: 20.15, color: bio.alpha(0.65), marginTop: 9 },
  keepCta: { height: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 18 },
  keepCtaText: { fontFamily: fontFamily.bold, fontSize: 14, color: bio.color.onViolet },
  destructive: {
    height: bio.invite.ctaSecondary.height,
    borderRadius: bio.invite.ctaSecondary.radius,
    borderWidth: 1,
    borderColor: bio.coralAlpha(0.4),
    alignItems: "center",
    justifyContent: "center",
    marginTop: 9,
  },
  destructiveText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.coralLt2 },
});
