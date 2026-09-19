/**
 * The audit trail (§10).
 *
 * `AdminScreen` has always told an admin that "every grant and withdrawal is
 * recorded in the audit log". Nothing read those rows, so the sentence was a
 * promise nobody could check. This screen is what makes it true.
 *
 * Three things it is careful about.
 *
 * **An account that no longer exists is information.** The server renders a
 * missing actor as "deleted account (a1b2…)" rather than blank, because a blank
 * row reads as a bug and hides the one fact worth seeing — somebody's account
 * went away and the trail outlived it, which is exactly what the trail is for.
 *
 * **Reading is itself recorded.** Server-side, first page only. Nothing here
 * can suppress it and nothing here needs to know it happened.
 *
 * **A bad cursor is a failure, not a first page.** Paging that silently
 * restarts turns a trivial bug into handing over the whole trail.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { fetchAuditLog, type AuditRow } from "./adminApi";

/**
 * The filters offered, by the action prefix they match.
 *
 * Deliberately a short list of the decisions somebody actually audits, not
 * every action the vocabulary contains: a filter row with thirty chips is a
 * filter row nobody uses. `action` is an exact match server-side, so each chip
 * names one action rather than a family.
 */
const FILTERS: { label: string; action?: string }[] = [
  { label: "Everything" },
  { label: "Capabilities", action: "role.changed" },
  { label: "Client access", action: "staff.viewed_client" },
  { label: "Approvals", action: "treatment.approved" },
  { label: "Declines", action: "treatment.declined" },
  { label: "Deletions", action: "account.deleted" },
  { label: "Trail reads", action: "audit.viewed" },
];

export function AuditLogScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    setFailed(null);
    setRows(null);
    try {
      const res = await fetchAuditLog(action ? { action } : {});
      setRows(res.entries);
      setCursor(res.cursor);
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, [action]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || more) return;
    setMore(true);
    try {
      const res = await fetchAuditLog(action ? { action, cursor } : { cursor });
      setRows((prev) => [...(prev ?? []), ...res.entries]);
      setCursor(res.cursor);
    } catch {
      // Keep what is on screen. Replacing a page someone is reading with an
      // error because the NEXT page failed is the worse outcome.
    } finally {
      setMore(false);
    }
  }, [action, cursor, more]);

  return (
    <View style={styles.root}>
      <StaticBloom color={bio.color.blue} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Audit log" label="Platform" onBack={onBack} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.label}
              onPress={() => {
                pressHaptic();
                setAction(f.action);
              }}
              style={({ pressed }) => [
                styles.chip,
                action === f.action && styles.chipOn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: action === f.action }}
              accessibilityLabel={f.label}
            >
              <Text style={[styles.chipText, action === f.action && styles.chipTextOn]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {failed ? (
          <LoadFailed what="the audit log" kind={failed} onRetry={() => void load()} />
        ) : rows === null ? (
          <View style={styles.loading}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing recorded</Text>
            <Text style={styles.emptyBody}>
              {action
                ? "No entries of this kind yet."
                : "The trail is empty. It fills as capabilities are granted, records are opened and decisions are made."}
            </Text>
          </View>
        ) : (
          <>
            {rows.map((r) => (
              <Entry key={r.id} row={r} />
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
                accessibilityLabel="Show older entries"
              >
                <Text style={styles.moreText}>{more ? "…" : "Older"}</Text>
              </Pressable>
            ) : (
              <Text style={styles.endNote}>That's the whole trail.</Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Entry({ row }: { row: AuditRow }) {
  // A flat map of scalars, guaranteed by `sanitiseAuditMeta` on the way in —
  // never health values, which is the reason that sanitiser exists.
  const meta = row.meta
    ? Object.entries(row.meta)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(" · ")
    : null;

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        {/* The stored action is terse and stable; `label` is the readable
            half, and it degrades to the raw string for an action written by a
            version this build has never heard of. */}
        <Text style={styles.label} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={styles.at}>{shortTime(row.at)}</Text>
      </View>
      <Text style={styles.who} numberOfLines={2}>
        {row.actor ?? "unknown"}
        {row.subject ? ` → ${row.subject}` : ""}
      </Text>
      {meta ? (
        <Text style={styles.meta} numberOfLines={2}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "16 Sep 14:02" — date and time, always.
 *
 * Not "2 hours ago": an audit trail is read to answer "when exactly", and a
 * relative label makes two entries four minutes apart look simultaneous.
 */
function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hh}:${mm}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  content: { paddingHorizontal: 20 },

  chips: { gap: 8, paddingVertical: 16, paddingRight: 20 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    backgroundColor: bio.color.surface,
  },
  chipOn: { borderColor: bio.blueAlpha(0.55), backgroundColor: bio.blueAlpha(0.12) },
  chipText: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.6) },
  chipTextOn: { color: bio.color.blueLt },
  pressed: { transform: [{ scale: 0.97 }] },

  row: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: bio.color.hairline,
  },
  rowTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  label: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.color.text, flexShrink: 1 },
  at: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.35) },
  who: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.5), marginTop: 3 },
  meta: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.33), marginTop: 3 },

  moreBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
    alignItems: "center",
  },
  moreText: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.alpha(0.65) },
  endNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: bio.alpha(0.3),
    textAlign: "center",
    marginTop: 18,
  },

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
