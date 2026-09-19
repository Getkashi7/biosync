/**
 * Browsing members (§10) — the deliberate counterpart to the exact-email
 * lookup on `AdminScreen`, not a replacement for it.
 *
 * The lookup refuses substring matching because "type 'a', receive the
 * membership list" is a bulk export wearing a search box. That reasoning is
 * still right, so this screen keeps its teeth and the server keeps them
 * structurally:
 *
 * - **Recent** shows the newest twenty-five and takes no cursor at all. There
 *   is no next page, so it answers "who joined this week" and cannot be walked
 *   backwards through the membership.
 * - **Search** needs three characters, and matches from the start of an address
 *   or name rather than anywhere inside it. Both are enforced at Zod before a
 *   query is built; the disabled button here is a courtesy, never the guard.
 * - **Every browse is recorded**, with the term. "Who did the admin go looking
 *   for" is exactly what this trail exists to answer.
 *
 * No health data crosses this screen. A member row is an identity and a set of
 * capabilities — never a registration number, and never a reading.
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
import { pressHaptic } from "../../lib/haptics";
import { dateLabel, initials } from "../../lib/format";
import { MIN_SEARCH, fetchMembers, type Member } from "./adminApi";

type Mode = "recent" | "search";

export function MembersScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("recent");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Member[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [more, setMore] = useState(false);

  const loadRecent = useCallback(async () => {
    setFailed(null);
    setRows(null);
    setCursor(null);
    try {
      const res = await fetchMembers({ mode: "recent" });
      setRows(res.members);
      setCursor(res.cursor);
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    if (mode === "recent") void loadRecent();
  }, [loadRecent, mode]);

  const runSearch = useCallback(async () => {
    const term = q.trim();
    if (term.length < MIN_SEARCH) return;
    setFailed(null);
    setRows(null);
    setCursor(null);
    try {
      const res = await fetchMembers({ mode: "search", q: term });
      setRows(res.members);
      setCursor(res.cursor);
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, [q]);

  const loadMore = useCallback(async () => {
    if (!cursor || more) return;
    setMore(true);
    try {
      const res = await fetchMembers({ mode: "search", q: q.trim(), cursor });
      setRows((prev) => [...(prev ?? []), ...res.members]);
      setCursor(res.cursor);
    } catch {
      // Keep the page already on screen.
    } finally {
      setMore(false);
    }
  }, [cursor, more, q]);

  const tooShort = q.trim().length > 0 && q.trim().length < MIN_SEARCH;

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
          <ScreenHeader title="Members" label="Platform" onBack={onBack} />

          <View style={styles.tabs}>
            <Tab label="Recent" on={mode === "recent"} onPress={() => setMode("recent")} />
            <Tab label="Search" on={mode === "search"} onPress={() => setMode("search")} />
          </View>

          {mode === "search" ? (
            <>
              <View style={styles.searchRow}>
                <View style={styles.input}>
                  <TextInput
                    value={q}
                    onChangeText={setQ}
                    placeholder="Name or start of an email"
                    placeholderTextColor={bio.alpha(0.38)}
                    style={styles.inputText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={() => void runSearch()}
                    selectionColor={bio.color.blue}
                    accessibilityLabel="Search members"
                  />
                </View>
                <Pressable
                  onPress={() => void runSearch()}
                  disabled={q.trim().length < MIN_SEARCH}
                  style={[styles.btn, q.trim().length < MIN_SEARCH && styles.btnOff]}
                  accessibilityRole="button"
                  accessibilityLabel="Search"
                  accessibilityState={{ disabled: q.trim().length < MIN_SEARCH }}
                >
                  <Text style={styles.btnText}>Find</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>
                {tooShort
                  ? `At least ${MIN_SEARCH} characters.`
                  : "Matches the start of a name or address, not anywhere inside it."}
              </Text>
            </>
          ) : (
            <Text style={styles.hint}>
              The newest 25 accounts. There's no way to page further back — that's
              deliberate.
            </Text>
          )}

          {failed ? (
            <LoadFailed
              what="the member list"
              kind={failed}
              onRetry={() => void (mode === "recent" ? loadRecent() : runSearch())}
            />
          ) : rows === null ? (
            mode === "search" && q.trim().length < MIN_SEARCH ? null : (
              <View style={styles.loading}>
                <Spinner tint={bio.color.text} />
              </View>
            )
          ) : rows.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {mode === "search" ? "Nobody matches that" : "No accounts yet"}
              </Text>
              <Text style={styles.emptyBody}>
                {mode === "search"
                  ? "Try the start of their email address, or the exact address on the Admin screen."
                  : "Nobody has signed up yet."}
              </Text>
            </View>
          ) : (
            <>
              {rows.map((m) => (
                <MemberRow key={m.id} member={m} />
              ))}
              {cursor ? (
                <Pressable
                  onPress={() => {
                    pressHaptic();
                    void loadMore();
                  }}
                  disabled={more}
                  style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Show more results"
                >
                  <Text style={styles.moreText}>{more ? "…" : "More"}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function MemberRow({ member }: { member: Member }) {
  const verified = member.capabilities.filter((c) => c.status === "VERIFIED");

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(member.name ?? member.email)}</Text>
      </View>
      <View style={styles.flexMin}>
        <Text style={styles.name} numberOfLines={1}>
          {member.name ?? member.email}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {member.name ? `${member.email} · ` : ""}
          {dateLabel(new Date(member.joined))}
        </Text>
      </View>
      <View style={styles.tags}>
        {member.role === "ADMIN" ? (
          <View style={styles.adminChip}>
            <Text style={styles.adminChipText}>ADMIN</Text>
          </View>
        ) : null}
        {/* Verified capabilities only. A pending or suspended one is not
            access, and showing it here would read as though it were. */}
        {verified.map((c) => (
          <View key={c.kind} style={styles.capChip}>
            <Text style={styles.capChipText}>{c.kind === "PT" ? "TRAINER" : "PRACT"}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Tab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        pressHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
    >
      <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  flex: { flex: 1 },
  flexMin: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 20 },

  tabs: { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 14 },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    backgroundColor: bio.color.surface,
  },
  tabOn: { borderColor: bio.blueAlpha(0.55), backgroundColor: bio.blueAlpha(0.12) },
  tabText: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.6) },
  tabTextOn: { color: bio.color.blueLt },

  searchRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.sm,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    paddingHorizontal: 14,
  },
  inputText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: bio.color.text,
    paddingVertical: 12,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: bio.radius.sm,
    backgroundColor: bio.blueAlpha(0.2),
    borderWidth: 1,
    borderColor: bio.blueAlpha(0.45),
  },
  btnOff: { opacity: 0.4 },
  btnText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.blueLt },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: bio.alpha(0.38),
    marginTop: 10,
    marginBottom: 8,
    lineHeight: 18,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: bio.color.hairline,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: bio.blueAlpha(0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.blueLt },
  name: { fontFamily: fontFamily.medium, fontSize: 15, color: bio.color.text },
  sub: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.42), marginTop: 2 },
  tags: { flexDirection: "row", gap: 6 },
  adminChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.blueAlpha(0.18),
  },
  adminChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: 9,
    letterSpacing: 0.7,
    color: bio.color.blueLt,
  },
  capChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.07),
  },
  capChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: 9,
    letterSpacing: 0.7,
    color: bio.alpha(0.5),
  },

  moreBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
    alignItems: "center",
  },
  moreText: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.alpha(0.65) },
  pressed: { transform: [{ scale: 0.97 }] },

  loading: { paddingVertical: 48, alignItems: "center" },
  empty: { paddingVertical: 32 },
  emptyTitle: { fontFamily: fontFamily.semibold, fontSize: 16, color: bio.color.text },
  emptyBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: bio.alpha(0.5),
    marginTop: 6,
    lineHeight: 20,
  },
});
