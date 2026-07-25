/**
 * Trainer roster (design 1A) and its empty state (1B).
 *
 * This is the restrained side of the system: ONE teal accent, a single static
 * bloom, flat hairline-separated rows, and no motion loops. Status is carried by
 * text and position — dots are small and solid, never glowing.
 *
 * Scope honesty: a trainer sees fitness & activity only, and that's enforced
 * server-side. A client who hasn't shared their activity shows an explicit
 * "Not shared" row with NO week strip — never zeroed bars, which would read as
 * "they did nothing" rather than "you can't see this".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { Spinner } from "../../ui/Spinner";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic, selectionHaptic } from "../../lib/haptics";
import { initials } from "../../lib/format";
import { fetchClients, type RosterClient } from "./trainerApi";

type Filter = "all" | "active" | "needs";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active today" },
  { id: "needs", label: "Needs check-in" },
];

/** days without a check-in before a client is flagged as needing one */
const NEEDS_CHECKIN_DAYS = 5;


export function TrainerRosterScreen({
  trainerName,
  onOpenClient,
  onInvite,
}: {
  trainerName: string;
  onOpenClient: (id: string) => void;
  /** open the invitations surface — the only way a client can be added */
  onInvite: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState<RosterClient[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setClients(await fetchClients());
    } catch {
      setClients([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const rows = useMemo(() => {
    const all = clients ?? [];
    const q = query.trim().toLowerCase();
    return all
      .filter((c) => {
        if (filter === "active") return c.lastCheckinDays === 0;
        if (filter === "needs") return c.lastCheckinDays === null || c.lastCheckinDays >= NEEDS_CHECKIN_DAYS;
        return true;
      })
      .filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [clients, query, filter]);

  const listLabel = filter === "active" ? "Active today" : filter === "needs" ? "Needs check-in" : "All clients";

  return (
    <View style={styles.root}>
      {/* one static, barely-there bloom — no breathe, no pulse */}
      <StaticBloom />

      <View style={[styles.inner, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 96 }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.eyebrow}>TRAINER · ROSTER</Text>
            <Text style={styles.name}>{trainerName}</Text>
          </View>
          <View style={styles.countBlock}>
            <Text style={styles.count}>{clients?.length ?? 0}</Text>
            <Text style={styles.countLabel}>CLIENTS</Text>
          </View>
          <Pressable
            onPress={() => {
              pressHaptic();
              onInvite();
            }}
            style={({ pressed }) => [styles.invite, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Invitations"
          >
            <View style={styles.inviteV} />
            <View style={styles.inviteH} />
          </Pressable>
        </View>

        <ScopeLine />

        <View style={styles.search}>
          <Svg width={15} height={15} viewBox="0 0 15 15" fill="none">
            <Circle cx={6.2} cy={6.2} r={5} stroke={bio.alpha(0.45)} strokeWidth={1.7} />
            <Path d="M10 10 L14 14" stroke={bio.alpha(0.45)} strokeWidth={1.7} strokeLinecap="round" />
          </Svg>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search clients"
            placeholderTextColor={bio.alpha(0.38)}
            style={styles.searchInput}
            selectionColor={bio.color.teal}
          />
        </View>

        <View style={styles.chips}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  selectionHaptic();
                  setFilter(f.id);
                }}
                style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.listHead}>
          <Text style={styles.listLabel}>{listLabel.toUpperCase()}</Text>
          <Text style={styles.listCount}>{rows.length}</Text>
        </View>

        {clients === null ? (
          <View style={styles.centre}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : clients.length === 0 ? (
          <EmptyRoster onInvite={onInvite} />
        ) : (
          <ScrollView
            style={styles.flex}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />
            }
          >
            {rows.map((c) => (
              <ClientRow
                key={c.id}
                client={c}
                onPress={() => {
                  pressHaptic();
                  onOpenClient(c.id);
                }}
              />
            ))}
            {rows.length === 0 ? <Text style={styles.noMatch}>No clients match “{query}”.</Text> : null}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

/** the quiet scope reminder that rides on every trainer screen */
export function ScopeLine() {
  return (
    <View style={styles.scope}>
      <View style={styles.scopeBars}>
        <View style={[styles.scopeBar, { height: 5 }]} />
        <View style={[styles.scopeBar, { height: 10 }]} />
        <View style={[styles.scopeBar, { height: 7 }]} />
      </View>
      <Text style={styles.scopeText}>Fitness &amp; activity only</Text>
    </View>
  );
}

function ClientRow({ client, onPress }: { client: RosterClient; onPress: () => void }) {
  const days = client.lastCheckinDays;
  const status = !client.activityShared
    ? "Not shared"
    : days === null
      ? "No check-ins yet"
      : days === 0
        ? "Active today"
        : days >= NEEDS_CHECKIN_DAYS
          ? "Needs a check-in"
          : "On track";

  const meta = !client.activityShared
    ? "Activity not shared with you"
    : days === null
      ? status
      : `${status} · last check-in ${days === 0 ? "today" : `${days}d`}`;

  // a small SOLID dot — teal only when they're active today
  const dotColour = !client.activityShared
    ? bio.alpha(0.25)
    : days === 0
      ? bio.color.teal
      : days !== null && days >= NEEDS_CHECKIN_DAYS
        ? bio.alpha(0.25)
        : bio.alpha(0.4);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(client.name)}</Text>
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowNameLine}>
          <Text style={styles.rowName} numberOfLines={1}>
            {client.name}
          </Text>
          <View style={[styles.statusDot, { backgroundColor: dotColour }]} />
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>

      {client.activityShared ? (
        <View style={styles.week}>
          {client.week.map((checked, i) => (
            <View key={i} style={[styles.weekBar, checked ? styles.weekBarOn : styles.weekBarOff]} />
          ))}
        </View>
      ) : (
        // the "not shared" motif — a dashed hollow dot, never a number or a blur
        <View style={styles.notShared} />
      )}

      <Svg width={7} height={7} viewBox="0 0 8 8" fill="none">
        <Path d="M2 1 L5.5 4 L2 7" stroke={bio.alpha(0.3)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

/** 1B — no clients yet. A flat mark, no fireworks. */
function EmptyRoster({ onInvite }: { onInvite: () => void }) {
  return (
    <View style={styles.centre}>
      <View style={styles.emptyMark}>
        <View style={[styles.emptyBar, { height: 14 }]} />
        <View style={[styles.emptyBar, { height: 26 }]} />
        <View style={[styles.emptyBar, { height: 20 }]} />
      </View>
      <Text style={styles.emptyTitle}>No clients yet</Text>
      <Text style={styles.emptySub}>
        Invite someone with a code. They accept in their own app, and choose what to share with you.
      </Text>
      <Pressable
        onPress={() => {
          pressHaptic();
          onInvite();
        }}
        style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Invite a client"
      >
        <Text style={styles.emptyCtaText}>Invite a client</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20 },


  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerLeft: { flex: 1 },
  eyebrow: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 1.68, color: bio.alpha(0.45) },
  name: { fontFamily: fontFamily.bold, fontSize: 23, letterSpacing: -0.35, color: bio.color.text, marginTop: 5 },
  countBlock: { alignItems: "flex-end" },
  invite: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.45),
    backgroundColor: bio.tealAlpha(0.1),
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  inviteV: { position: "absolute", width: 1.8, height: 13, borderRadius: 2, backgroundColor: bio.color.teal },
  inviteH: { position: "absolute", width: 13, height: 1.8, borderRadius: 2, backgroundColor: bio.color.teal },
  emptyCta: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.45),
    backgroundColor: bio.tealAlpha(0.1),
  },
  emptyCtaText: { fontFamily: fontFamily.bold, fontSize: 13, color: bio.color.teal },
  count: { fontFamily: fontFamily.dot, fontSize: 30, lineHeight: 32, color: bio.color.teal },
  countLabel: { fontFamily: fontFamily.semibold, fontSize: 9.5, letterSpacing: 1.33, color: bio.alpha(0.4), marginTop: 4 },

  scope: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  scopeBars: { flexDirection: "row", alignItems: "flex-end", gap: 1.6, height: 10 },
  scopeBar: { width: 2, borderRadius: 1, backgroundColor: bio.tealAlpha(0.75) },
  scopeText: { fontFamily: fontFamily.medium, fontSize: 11.5, color: bio.alpha(0.55) },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    marginTop: 16,
  },
  searchInput: { flex: 1, minWidth: 0, fontFamily: fontFamily.regular, fontSize: 14, color: bio.color.text, padding: 0 },

  chips: { flexDirection: "row", gap: 8, marginTop: 12 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 11,
    backgroundColor: bio.alpha(0.03),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  chipOn: { backgroundColor: bio.tealAlpha(0.14), borderColor: bio.tealAlpha(0.45) },
  chipText: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.alpha(0.55) },
  chipTextOn: { color: bio.color.teal },

  listHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 16,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.08),
  },
  listLabel: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.76, color: bio.alpha(0.45) },
  listCount: { fontFamily: fontFamily.dotBold, fontSize: 13, color: bio.alpha(0.5) },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 40 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.06),
  },
  rowPressed: { opacity: 0.55 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: bio.alpha(0.06),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.alpha(0.8) },
  rowBody: { flex: 1, minWidth: 0 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowName: { flexShrink: 1, fontFamily: fontFamily.semibold, fontSize: 15, letterSpacing: -0.15, color: bio.color.text },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  rowMeta: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.45), marginTop: 3 },

  week: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 24 },
  weekBar: { width: 4, borderRadius: 1.5 },
  weekBarOn: { height: 18, backgroundColor: bio.tealAlpha(0.6) },
  weekBarOff: { height: 3, backgroundColor: bio.alpha(0.12) },
  notShared: { width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5, borderStyle: "dashed", borderColor: bio.alpha(0.4) },

  noMatch: {
    textAlign: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    fontFamily: fontFamily.light,
    fontSize: 13,
    color: bio.alpha(0.4),
  },

  emptyMark: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 26 },
  emptyBar: { width: 5, borderRadius: 2, backgroundColor: bio.tealAlpha(0.55) },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: bio.color.text, marginTop: 20 },
  emptySub: {
    fontFamily: fontFamily.light,
    fontSize: 13,
    lineHeight: 20,
    color: bio.alpha(0.5),
    textAlign: "center",
    maxWidth: 270,
    marginTop: 8,
  },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
