/**
 * Trainer → client detail (design 2A) and its nothing-shared state (2B).
 *
 * Scope-bounded and honest: the header carries the "fitness & activity only"
 * banner, and anything this client hasn't shared appears as an explicit
 * "Not shared" row — never a placeholder number or a blurred teaser.
 *
 * Everything rendered here is already filtered server-side by consent ∩ role
 * ceiling, so an absent section means "not permitted", not "no data". The one
 * place that distinction matters is Recent activity, where we show check-in days
 * plainly and say when a day had none, rather than inventing a workout.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { dayDiff, initials, monthShort, monthYear } from "../../lib/format";
import { fetchClient, type ClientDetail } from "./trainerApi";





export function TrainerClientScreen({
  clientId,
  onBack,
  onAddNote,
  onBuildPlan,
  refreshKey = 0,
}: {
  clientId: string;
  onBack: () => void;
  onAddNote: (clientName: string) => void;
  onBuildPlan: (clientName: string) => void;
  /** bumped after a note is saved so the sessions list refetches */
  refreshKey?: number;
}) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ClientDetail | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await fetchClient(clientId));
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (data === null) {
    return (
      <View style={styles.root}>
        <View style={[styles.centre, { paddingTop: insets.top }]}>
          {/* Previously a dead end: the message had no retry, so a blip meant
              backing out and re-entering the screen to try again. */}
          {failed ? (
            <LoadFailed what="this client" kind={failed} onRetry={() => void load()} />
          ) : (
            <Spinner tint={bio.color.text} />
          )}
        </View>
      </View>
    );
  }

  const seesActivity = data.visible.includes("ACTIVITY");
  const nothingShared = data.visible.length === 0;

  // This week, from the check-in dates we're permitted to see.
  const today = new Date();
  const checkinDates = data.activity.map((a) => new Date(a.date));
  const activeDays = checkinDates.filter((d) => dayDiff(today, d) < 7).length;
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    if (checkinDates.some((d) => dayDiff(today, d) === i)) streak += 1;
    else if (i > 0) break;
  }

  return (
    <View style={styles.root}>
      <StaticBloom />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 96 }]}
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
              <Path d="M6.5 1 L2.5 5 L6.5 9" stroke={bio.alpha(0.8)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>
              {data.name}
            </Text>
            <Text style={styles.since}>CLIENT SINCE {monthYear(new Date(data.since)).toUpperCase()}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(data.name)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              pressHaptic();
              onBuildPlan(data.name);
            }}
            style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.actionPrimaryText}>Build a plan</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              pressHaptic();
              onAddNote(data.name);
            }}
            style={({ pressed }) => [styles.actionBtn, styles.actionGhost, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.actionGhostText}>Add note</Text>
          </Pressable>
        </View>

        <View style={styles.scopeCard}>
          <View style={styles.scopeIcon}>
            <Svg width={15} height={17} viewBox="0 0 15 17" fill="none">
              <Path
                d="M7.5 1 L14 3.2 V8.5 C14 12.5 11 15 7.5 16 C4 15 1 12.5 1 8.5 V3.2 Z"
                stroke={bio.color.teal}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            </Svg>
          </View>
          <View style={styles.flex}>
            <Text style={styles.scopeTitle}>Fitness &amp; activity only</Text>
            <Text style={styles.scopeBody}>This client’s health data isn’t visible to you.</Text>
          </View>
        </View>

        {nothingShared ? (
          <NothingShared notShared={data.notShared} />
        ) : (
          <>
            {seesActivity ? (
              <>
                <Text style={styles.sectionLabel}>THIS WEEK</Text>
                <View style={styles.stats}>
                  <Stat value={data.sessions.length} label="Sessions" />
                  <View style={styles.statDivider} />
                  <Stat value={activeDays} label="Active days" />
                  <View style={styles.statDivider} />
                  <Stat value={streak} label="Day streak" />
                </View>
              </>
            ) : null}

            {data.goals.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>STATED GOALS</Text>
                <View style={styles.goalCard}>
                  {data.goals.map((g, i) => (
                    <View key={g.id} style={[styles.goalRow, i === data.goals.length - 1 && styles.goalRowLast]}>
                      <View style={styles.goalMark} />
                      <Text style={styles.goalText}>{g.description}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {seesActivity ? (
              <>
                <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
                {data.activity.length === 0 ? (
                  <Text style={styles.quiet}>No check-ins in the last two weeks.</Text>
                ) : (
                  data.activity.map((a, i) => {
                    const d = new Date(a.date);
                    return (
                      <View key={i} style={styles.timelineRow}>
                        <View style={styles.dateCol}>
                          <Text style={styles.dateDay}>{String(d.getDate()).padStart(2, "0")}</Text>
                          <Text style={styles.dateMonth}>{monthShort(d).toUpperCase()}</Text>
                        </View>
                        <View style={styles.timelineRule} />
                        <View style={styles.flex}>
                          <Text style={styles.rowTitle}>Checked in</Text>
                          <Text style={styles.rowSub}>Logged their day</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </>
            ) : null}
          </>
        )}

        <View style={styles.sessionsHead}>
          <Text style={[styles.sectionLabel, styles.sectionLabelFlush]}>YOUR SESSIONS</Text>
          <Pressable
            onPress={() => {
              pressHaptic();
              onAddNote(data.name);
            }}
            style={({ pressed }) => [styles.addNote, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.addNoteText}>+ Note</Text>
          </Pressable>
        </View>
        {data.sessions.length === 0 ? (
          <Text style={styles.quiet}>No session notes yet.</Text>
        ) : (
          data.sessions.map((s) => {
            const d = new Date(s.createdAt);
            return (
              <View key={s.id} style={styles.timelineRow}>
                <View style={styles.dateCol}>
                  <Text style={styles.dateDaySoft}>{String(d.getDate()).padStart(2, "0")}</Text>
                  <Text style={styles.dateMonth}>{monthShort(d).toUpperCase()}</Text>
                </View>
                <View style={styles.timelineRule} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {s.body}
                  </Text>
                  <Text style={styles.rowSub}>{s.sharedWithClient ? "Shared with client" : "Private to you"}</Text>
                </View>
              </View>
            );
          })
        )}

        {!nothingShared && data.notShared.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>NOT SHARED WITH YOU</Text>
            {data.notShared.map((n) => (
              <NotSharedRow key={n} label={n} />
            ))}
            <Text style={styles.footnote}>
              The client chooses what to share. These appear here only if they turn them on.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

function NotSharedRow({ label }: { label: string }) {
  return (
    <View style={styles.notSharedRow}>
      <View style={styles.notSharedDot} />
      <Text style={styles.notSharedLabel}>{label}</Text>
      <Text style={styles.notSharedTag}>Not shared</Text>
    </View>
  );
}

/** 2B — connected, but they've shared nothing. Calm and explanatory, not an error. */
function NothingShared({ notShared }: { notShared: string[] }) {
  return (
    <View style={styles.nothing}>
      <Text style={styles.nothingTitle}>This client hasn’t shared anything with you yet.</Text>
      <Text style={styles.nothingBody}>
        You’re connected, but they haven’t turned on any sharing. It’s entirely their choice — and they can change
        it at any time.
      </Text>

      {notShared.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, styles.nothingLabel]}>WHAT YOU’D SEE</Text>
          {notShared.map((n) => (
            <NotSharedRow key={n} label={n} />
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, flexGrow: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },


  header: { flexDirection: "row", alignItems: "center", gap: 13 },
  headerText: { flex: 1, minWidth: 0 },
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
  name: { fontFamily: fontFamily.bold, fontSize: 21, letterSpacing: -0.21, color: bio.color.text },
  since: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 1.47, color: bio.alpha(0.45), marginTop: 3 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: bio.alpha(0.06),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.alpha(0.85) },

  scopeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: bio.radius.sm,
    backgroundColor: bio.tealAlpha(0.06),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.22),
  },
  scopeIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: bio.tealAlpha(0.1),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.28),
    alignItems: "center",
    justifyContent: "center",
  },
  scopeTitle: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.alpha(0.9) },
  scopeBody: { fontFamily: fontFamily.light, fontSize: 11.5, lineHeight: 17, color: bio.alpha(0.58), marginTop: 3 },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 22,
    marginBottom: 10,
  },

  stats: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 18,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  stat: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, alignItems: "center" },
  statValue: { fontFamily: fontFamily.dot, fontSize: 26, lineHeight: 28, color: bio.color.teal },
  statLabel: { fontFamily: fontFamily.semibold, fontSize: 9, letterSpacing: 0.9, color: bio.alpha(0.42), marginTop: 6 },
  statDivider: { width: 1, backgroundColor: bio.alpha(0.08), marginVertical: 12 },

  goalCard: {
    borderRadius: 18,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    padding: 4,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.07),
  },
  goalRowLast: { borderBottomColor: "transparent" },
  goalMark: { width: 4, height: 16, borderRadius: 2, backgroundColor: bio.color.teal },
  goalText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13.5, color: bio.alpha(0.85) },

  timelineRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.06),
  },
  dateCol: { width: 32, alignItems: "center" },
  dateDay: { fontFamily: fontFamily.dotBold, fontSize: 17, lineHeight: 18, color: bio.alpha(0.85) },
  dateDaySoft: { fontFamily: fontFamily.dotBold, fontSize: 17, lineHeight: 18, color: bio.alpha(0.75) },
  dateMonth: { fontFamily: fontFamily.bold, fontSize: 8, letterSpacing: 0.8, color: bio.alpha(0.34), marginTop: 3 },
  timelineRule: { width: 1, backgroundColor: bio.alpha(0.08) },
  rowTitle: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.alpha(0.9) },
  rowSub: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.45), marginTop: 2 },

  notSharedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.06),
  },
  notSharedDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderStyle: "dashed", borderColor: bio.alpha(0.28) },
  notSharedLabel: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13.5, color: bio.alpha(0.55) },
  notSharedTag: { fontFamily: fontFamily.medium, fontSize: 11.5, color: bio.alpha(0.35) },

  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionBtn: { flex: 1, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionPrimary: { backgroundColor: bio.tealAlpha(0.14), borderWidth: 1, borderColor: bio.tealAlpha(0.4) },
  actionPrimaryText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.teal },
  actionGhost: { backgroundColor: bio.alpha(0.05), borderWidth: 1, borderColor: bio.alpha(0.11) },
  actionGhostText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.alpha(0.75) },

  sessionsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabelFlush: { marginBottom: 0 },
  addNote: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.tealAlpha(0.1),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.32),
    marginTop: 22,
    marginBottom: 10,
  },
  addNoteText: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.color.teal },

  quiet: { fontFamily: fontFamily.light, fontSize: 12.5, color: bio.alpha(0.4), paddingHorizontal: 4, paddingVertical: 6 },
  footnote: {
    fontFamily: fontFamily.light,
    fontSize: 11.5,
    lineHeight: 17,
    color: bio.alpha(0.4),
    marginTop: 12,
    paddingHorizontal: 4,
  },

  nothing: { marginTop: 24 },
  nothingTitle: { fontFamily: fontFamily.bold, fontSize: 17, lineHeight: 24, color: bio.color.text },
  nothingBody: { fontFamily: fontFamily.light, fontSize: 13, lineHeight: 20, color: bio.alpha(0.55), marginTop: 8 },
  nothingLabel: { marginTop: 24 },

  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 17, color: bio.color.text },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
