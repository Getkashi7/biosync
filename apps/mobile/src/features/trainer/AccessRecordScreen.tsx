/**
 * The access record — built to the 9F handoff.
 *
 * One screen, two readers, one set of rows:
 *
 * - **staff** — a care provider's own reads of one client. The handoff's line,
 *   "Sarah sees the same record", is only honest because of the other mode.
 * - **mine** — the client's view of every provider who opened their records,
 *   reached from Who sees what. Same rows, with the name added.
 *
 * It lists only what the audit trail logged (see `ACCESS_LABELS` in shared):
 * this screen's entire claim is that it *is* the record, so it never fills a
 * gap with an event the server did not write.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { Spinner } from "../../ui/Spinner";
import { pressHaptic } from "../../lib/haptics";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { clockTime, monthShort } from "../../lib/format";
import { trpc } from "../../lib/trpc";
import { bio, fontFamily } from "../../ui/theme";

const r = bio.record;

export type AccessRecordMode = { kind: "staff"; clientId: string } | { kind: "mine" };

type Event = { what: string; at: string };

/** "9 SEP · 14:22", on the reader's own clock. */
function when(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${monthShort(d).toUpperCase()} · ${clockTime(d)}`;
}

export function AccessRecordScreen({
  mode,
  onBack,
}: {
  mode: AccessRecordMode;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ subtitle: string; line: string; events: Event[] } | null>(
    null,
  );
  const [failed, setFailed] = useState<NetFailure | null>(null);

  // Keyed on the values, not the `mode` object: callers pass it inline
  // (`mode={{ kind: "mine" }}`), so it is a new object on every parent render,
  // and depending on it re-fetched the whole record each time the shell did.
  const clientId = mode.kind === "staff" ? mode.clientId : null;

  const load = useCallback(async () => {
    setFailed(null);
    try {
      if (clientId) {
        const res = await trpc.staff.accessRecord.query({ clientId });
        const first = res.clientName.trim().split(/\s+/)[0] || "Your client";
        setData({
          subtitle: res.clientName,
          line: `${first} sees the same record.`,
          events: res.events,
        });
      } else {
        const res = await trpc.account.accessRecord.query();
        setData({
          subtitle: "Who has looked",
          line: "Every time someone on your care team opened your records.",
          events: res.events.map((e) => ({ what: `${e.who} · ${e.what}`, at: e.at })),
        });
      }
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              pressHaptic();
              onBack();
            }}
            hitSlop={12}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
              <Path
                d="M15 5l-7 7 7 7"
                stroke={bio.alpha(0.85)}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
          <View style={styles.flexMin}>
            <Text style={styles.title}>Access record</Text>
            {data ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {data.subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {failed ? (
          <View style={styles.state}>
            <LoadFailed what="the access record" kind={failed} onRetry={() => void load()} />
          </View>
        ) : data === null ? (
          <View style={styles.state}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : (
          <>
            <Text style={styles.line}>{data.line}</Text>
            {data.events.length === 0 ? (
              // Not an error and not a placeholder: nobody has looked yet.
              <Text style={styles.empty}>
                {mode.kind === "staff"
                  ? "You haven't opened anything of theirs yet."
                  : "No one has opened your records yet."}
              </Text>
            ) : (
              <View style={styles.list}>
                {data.events.map((e, i) => (
                  <View key={`${e.at}${i}`} style={styles.event}>
                    <View style={styles.rail}>
                      <View style={styles.dot} />
                      {i < data.events.length - 1 ? <View style={styles.stem} /> : null}
                    </View>
                    <View style={styles.eventBody}>
                      <Text style={styles.what}>{e.what}</Text>
                      <Text style={styles.when}>{when(e.at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flexMin: { flex: 1, minWidth: 0 },
  pressed: { transform: [{ scale: 0.97 }] },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fontFamily.bold, fontSize: 17.5, letterSpacing: -0.18, color: bio.color.text },
  subtitle: { fontFamily: fontFamily.medium, fontSize: 11.5, color: bio.alpha(0.55), marginTop: 2 },
  state: { paddingTop: 80, alignItems: "center" },
  line: { ...r.line, color: bio.alpha(0.55), marginTop: 14 },
  empty: { ...r.what, color: bio.alpha(0.55), marginTop: 22 },
  list: { marginTop: 22 },
  event: { flexDirection: "row", gap: r.gap },
  rail: { width: r.rail, alignItems: "center" },
  dot: {
    width: r.dot,
    height: r.dot,
    borderRadius: r.dot / 2,
    backgroundColor: bio.alpha(0.45),
    marginTop: r.dotTop,
  },
  stem: { width: 1, flex: 1, backgroundColor: bio.alpha(0.1), marginTop: 4 },
  eventBody: { flex: 1, minWidth: 0, paddingBottom: r.rowPad },
  what: { ...r.what, color: bio.alpha(0.82) },
  when: { ...r.when, color: bio.alpha(0.5), marginTop: 4 },
});
