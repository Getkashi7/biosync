/**
 * Admin — granting and withdrawing staff capability (§10, first slice).
 *
 * Until now the only way to make someone a trainer was a script against the
 * production database. This is the same operation, done deliberately and
 * audited, by someone who is already an admin.
 *
 * Restrained register (the trainer bundle's rules): one accent, a single static
 * bloom, flat hairline rows. Blue rather than teal, because this is platform
 * administration and not a care surface — the distinction matters, since an
 * admin is explicitly NOT on anyone's care team.
 *
 * You look someone up by their full email address. There is no browse-all list,
 * and that's a deliberate limit rather than a missing feature: a searchable
 * roster of everyone who uses a health app is a liability, and granting
 * capability never needs one.
 */
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, pressHaptic, successHaptic } from "../../lib/haptics";
import { dateLabel, initials } from "../../lib/format";
import {
  fetchStats,
  findUser,
  grantStaff,
  revokeStaff,
  statusOf,
  type AdminStats,
  type FoundUser,
  type StaffKind,
} from "./adminApi";

const KINDS: { key: StaffKind; label: string; scope: string }[] = [
  { key: "PT", label: "Trainer", scope: "Fitness & activity only" },
  { key: "PRACTITIONER", label: "Practitioner", scope: "Can see consented health data" },
];

type Pending = { kind: StaffKind; action: "grant" | "revoke" } | null;

export function AdminScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsFailed, setStatsFailed] = useState<NetFailure | null>(null);
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<FoundUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const loadStats = useCallback(async () => {
    setStatsFailed(null);
    try {
      setStats(await fetchStats());
    } catch (e) {
      setStatsFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const search = useCallback(async () => {
    const q = email.trim();
    if (!q || searching) return;
    setSearching(true);
    setError(null);
    setNotFound(false);
    setUser(null);
    setConfirm(null);
    try {
      setUser(await findUser(q));
      pressHaptic();
    } catch (e) {
      // NOT_FOUND is an ordinary outcome here (a typo, or they haven't signed
      // up yet), so it reads as an answer rather than a failure.
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (msg.includes("no account")) {
        setNotFound(true);
      } else {
        setError("Couldn't look that up. Check your connection and try again.");
      }
      errorHaptic();
    } finally {
      setSearching(false);
    }
  }, [email, searching]);

  const apply = useCallback(async () => {
    if (!confirm || !user || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (confirm.action === "grant") await grantStaff(user.id, confirm.kind);
      else await revokeStaff(user.id, confirm.kind);
      successHaptic();
      setConfirm(null);
      // Re-read rather than patching local state: the server is the authority
      // on what this account can now do.
      setUser(await findUser(user.email));
      void loadStats();
    } catch {
      errorHaptic();
      setError("That didn't go through. Nothing was changed — try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, confirm, loadStats, user]);

  return (
    <View style={styles.root}>
      <StaticBloom color={bio.color.blue} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="Admin" label="Platform" onBack={onBack} />

          {statsFailed ? (
            <LoadFailed what="platform stats" kind={statsFailed} onRetry={() => void loadStats()} />
          ) : stats === null ? (
            <View style={styles.statsLoading}>
              <Spinner tint={bio.color.text} />
            </View>
          ) : (
            <View style={styles.stats}>
              <Stat value={stats.users} label="MEMBERS" />
              <Stat value={stats.staff.verified} label="STAFF" />
              <Stat value={stats.activeLinks} label="LINKS" />
              <Stat value={stats.openInvites} label="INVITES" />
            </View>
          )}

          <Text style={styles.section}>FIND AN ACCOUNT</Text>
          <View style={styles.searchRow}>
            <View style={styles.input}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="their@email.com"
                placeholderTextColor={bio.alpha(0.38)}
                style={styles.inputText}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="search"
                onSubmitEditing={() => void search()}
                selectionColor={bio.color.blue}
                accessibilityLabel="Email address to look up"
              />
            </View>
            <Pressable
              onPress={() => void search()}
              disabled={!email.trim() || searching}
              style={[styles.searchBtn, (!email.trim() || searching) && styles.searchBtnOff]}
              accessibilityRole="button"
              accessibilityLabel="Find account"
              accessibilityState={{ disabled: !email.trim() || searching }}
            >
              <Text style={styles.searchBtnText}>{searching ? "…" : "Find"}</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Full address only — there's no member list, by design.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {notFound ? (
            <View style={styles.notFound}>
              <Text style={styles.notFoundTitle}>No account with that email</Text>
              <Text style={styles.notFoundBody}>
                They need to sign up in the app first. Check the spelling, too.
              </Text>
            </View>
          ) : null}

          {user ? (
            <>
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(user.fullName ?? user.email)}</Text>
                  </View>
                  <View style={styles.flexMin}>
                    <Text style={styles.name} numberOfLines={1}>
                      {user.fullName ?? "No name set"}
                    </Text>
                    <Text style={styles.email} numberOfLines={1}>
                      {user.email}
                    </Text>
                  </View>
                  {user.role === "ADMIN" ? (
                    <View style={styles.adminChip}>
                      <Text style={styles.adminChipText}>ADMIN</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.joined}>Joined {dateLabel(new Date(user.createdAt))}</Text>
              </View>

              <Text style={styles.section}>CAPABILITIES</Text>
              {KINDS.map((k) => {
                const status = statusOf(user, k.key);
                const active = status === "VERIFIED";
                const pending = confirm?.kind === k.key;
                return (
                  <View key={k.key} style={styles.capRow}>
                    {pending ? (
                      <View style={styles.confirm}>
                        <Text style={styles.confirmTitle}>
                          {confirm.action === "grant"
                            ? `Grant ${k.label.toLowerCase()} access?`
                            : `Withdraw ${k.label.toLowerCase()} access?`}
                        </Text>
                        <Text style={styles.confirmBody}>
                          {confirm.action === "grant"
                            ? k.key === "PRACTITIONER"
                              ? "They'll be able to read the health data their clients choose to share — biometrics, journal and diagnostics. Only grant this to someone you've verified."
                              : "They'll be able to see the fitness and activity their clients choose to share. Never health records."
                            : "They lose the professional surface immediately. Their existing client links stay on record, and this is logged."}
                        </Text>
                        <View style={styles.confirmBtns}>
                          <Pressable
                            onPress={() => void apply()}
                            disabled={busy}
                            style={styles.confirmGo}
                            accessibilityRole="button"
                            accessibilityLabel={confirm.action === "grant" ? "Confirm grant" : "Confirm withdraw"}
                            accessibilityState={{ disabled: busy }}
                          >
                            <Text style={styles.confirmGoText}>
                              {busy ? "Working…" : confirm.action === "grant" ? "Grant" : "Withdraw"}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setConfirm(null)}
                            style={styles.confirmCancel}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel"
                          >
                            <Text style={styles.confirmCancelText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.capInner}>
                        <View style={styles.flexMin}>
                          <View style={styles.capNameRow}>
                            {active ? <View style={styles.capDot} /> : null}
                            <Text style={styles.capName}>{k.label}</Text>
                          </View>
                          <Text style={styles.capScope}>{k.scope}</Text>
                        </View>
                        <View style={styles.capRight}>
                          <Text style={[styles.capStatus, active && styles.capStatusOn]}>
                            {status ?? "Not granted"}
                          </Text>
                          <Pressable
                            onPress={() => {
                              pressHaptic();
                              setConfirm({ kind: k.key, action: active ? "revoke" : "grant" });
                            }}
                            style={styles.capBtn}
                            accessibilityRole="button"
                            accessibilityLabel={`${active ? "Withdraw" : "Grant"} ${k.label} access`}
                          >
                            <Text style={styles.capBtnText}>{active ? "Withdraw" : "Grant"}</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}

              <Text style={styles.audit}>Every grant and withdrawal is recorded in the audit log.</Text>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  flexMin: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 20, flexGrow: 1 },

  statsLoading: { paddingVertical: 32, alignItems: "center" },
  stats: { flexDirection: "row", marginTop: 16, gap: 8 },
  stat: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    backgroundColor: bio.color.glassLo,
    alignItems: "center",
  },
  statValue: { fontFamily: fontFamily.dot, fontSize: 24, color: bio.color.blueLt },
  statLabel: { fontFamily: fontFamily.semibold, fontSize: 8.5, letterSpacing: 1.19, color: bio.alpha(0.4), marginTop: 4 },

  section: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 26,
    paddingHorizontal: 2,
  },

  searchRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  input: {
    flex: 1,
    height: 46,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: bio.color.glassLo,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  inputText: { fontFamily: fontFamily.regular, fontSize: 14, color: bio.color.text, padding: 0 },
  searchBtn: {
    paddingHorizontal: 20,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: bio.color.blue,
    backgroundColor: bio.alpha(0.05),
  },
  searchBtnOff: { opacity: 0.4 },
  searchBtnText: { fontFamily: fontFamily.bold, fontSize: 13.5, color: bio.color.blueLt },
  hint: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.45), marginTop: 8, paddingHorizontal: 2 },

  error: { fontFamily: fontFamily.regular, fontSize: 12.5, lineHeight: 18, color: bio.color.coralLt, marginTop: 14 },

  notFound: { marginTop: 22, paddingVertical: 20, alignItems: "center" },
  notFoundTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: bio.color.text },
  notFoundBody: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 19,
    color: bio.alpha(0.55),
    textAlign: "center",
    maxWidth: 280,
    marginTop: 6,
  },

  card: {
    marginTop: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    backgroundColor: bio.color.glassLo,
    padding: 14,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.alpha(0.85) },
  name: { fontFamily: fontFamily.semibold, fontSize: 15, color: bio.color.text },
  email: { fontFamily: fontFamily.light, fontSize: 12, color: bio.alpha(0.5), marginTop: 2 },
  adminChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: bio.color.blue,
    backgroundColor: bio.alpha(0.05),
  },
  adminChipText: { fontFamily: fontFamily.bold, fontSize: 9, letterSpacing: 0.9, color: bio.color.blueLt },
  joined: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.4), marginTop: 10 },

  capRow: { borderBottomWidth: 1, borderBottomColor: bio.alpha(0.06) },
  capInner: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  capNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  capDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: bio.color.blueLt },
  capName: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.text },
  capScope: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.45), marginTop: 3 },
  capRight: { alignItems: "flex-end", gap: 6 },
  capStatus: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 0.5, color: bio.alpha(0.4) },
  capStatusOn: { color: bio.color.blueLt },
  capBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: bio.color.border,
  },
  capBtnText: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: bio.alpha(0.75) },

  confirm: { paddingVertical: 14, paddingHorizontal: 4 },
  confirmTitle: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.text },
  confirmBody: { fontFamily: fontFamily.light, fontSize: 12, lineHeight: 18.5, color: bio.alpha(0.6), marginTop: 5 },
  confirmBtns: { flexDirection: "row", gap: 8, marginTop: 12 },
  confirmGo: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: bio.color.blue,
    backgroundColor: bio.alpha(0.06),
  },
  confirmGoText: { fontFamily: fontFamily.bold, fontSize: 12, color: bio.color.blueLt },
  confirmCancel: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  confirmCancelText: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.alpha(0.6) },

  audit: {
    fontFamily: fontFamily.light,
    fontSize: 11.5,
    color: bio.alpha(0.4),
    marginTop: 18,
    paddingHorizontal: 2,
  },
});
