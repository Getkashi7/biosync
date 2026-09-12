/**
 * §3 Fitness plans — today's session, the week, and how it felt.
 *
 * Coral accent per the brief. Four things the screen has to get right:
 *
 * - **The "why this today" line is the point.** Every session carries the
 *   rationale the server computed from the user's own readiness. It is shown
 *   with the session, not buried, because a plan that quietly halves your
 *   volume without saying why reads as the app losing interest.
 * - **A rest day is a real state**, not an absence. Low readiness produces a
 *   rest day with a reason, and it must not look like a loading failure or an
 *   empty week.
 * - **No goal is a different thing again.** The brief's empty state is "Set a
 *   goal and I'll build your week" — we do not invent one.
 * - **Never an empty state for a failed request** (CLAUDE.md): a fetch error
 *   renders `LoadFailed`, classified offline vs server.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic, selectionHaptic } from "../../lib/haptics";
import { todayLocal } from "../checkin/checkinApi";
import { formatSetsReps, weekDots } from "../../lib/fitnessFormat";
import {
  completeSession,
  fetchWeek,
  regenerateWeek,
  toggleExercise,
  type Session,
  type SessionFeedback,
  type Week,
} from "./fitnessApi";

const FEEDBACK: { value: SessionFeedback; label: string }[] = [
  { value: "TOO_HARD", label: "Too hard" },
  { value: "JUST_RIGHT", label: "Just right" },
  { value: "TOO_EASY", label: "Too easy" },
];

export function FitnessScreen({ onBack, onSetGoal }: { onBack: () => void; onSetGoal: () => void }) {
  const insets = useSafeAreaInsets();
  const today = todayLocal();
  const [week, setWeek] = useState<Week | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [selected, setSelected] = useState<string>(today);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setWeek(await fetchWeek(today));
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const session = week?.sessions.find((s) => s.date === selected) ?? null;

  const onToggle = async (slug: string, done: boolean) => {
    if (!session || busy) return;
    selectionHaptic();
    // Optimistic: ticking a set should feel instant mid-session. A failure
    // reloads from the server rather than leaving a tick that never saved.
    setWeek((w) =>
      w === null
        ? w
        : {
            ...w,
            sessions: w.sessions.map((s) =>
              s.date === session.date
                ? { ...s, items: s.items.map((i) => (i.slug === slug ? { ...i, done } : i)) }
                : s,
            ),
          },
    );
    try {
      await toggleExercise(session.date, slug, done);
    } catch {
      await load();
    }
  };

  const onFeedback = async (feedback: SessionFeedback) => {
    if (!session || busy) return;
    pressHaptic();
    setBusy(true);
    try {
      await completeSession(session.date, feedback);
      await load();
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onRegenerate = async () => {
    if (busy) return;
    pressHaptic();
    setBusy(true);
    try {
      await regenerateWeek(today);
      await load();
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  };

  const body = (): React.ReactNode => {
    if (failed) return <LoadFailed what="your plan" kind={failed} onRetry={() => void load()} />;
    if (week === null) {
      return (
        <View style={styles.centre}>
          <Spinner tint={bio.color.text} />
        </View>
      );
    }
    if (!week.planned) return <NoGoal onSetGoal={onSetGoal} />;

    return (
      <>
        <WeekSpine sessions={week.sessions} selected={selected} today={today} onPick={setSelected} />
        {session ? (
          <SessionCard
            session={session}
            isToday={session.date === today}
            busy={busy}
            onToggle={(slug, done) => void onToggle(slug, done)}
            onFeedback={(f) => void onFeedback(f)}
          />
        ) : null}
        <Pressable
          onPress={() => void onRegenerate()}
          disabled={busy}
          style={({ pressed }) => [styles.rebuild, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.rebuildText}>Rebuild the rest of this week</Text>
        </Pressable>
        <Text style={styles.rebuildNote}>
          Sessions you&apos;ve started or rated are kept — only untouched days are rebuilt.
        </Text>
      </>
    );
  };

  return (
    <View style={styles.root}>
      <StaticBloom color={bio.color.coral} opacity={0.05} />
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
            <Text style={styles.title}>Training</Text>
            <Text style={styles.subtitle}>
              {week?.goal ? week.goal.toUpperCase() : "BUILT FROM YOUR READINESS"}
            </Text>
          </View>
        </View>
        {body()}
      </ScrollView>
    </View>
  );
}

/** The 7 day-dots on a dotted spine, tinted by planned load. */
function WeekSpine({
  sessions,
  selected,
  today,
  onPick,
}: {
  sessions: Session[];
  selected: string;
  today: string;
  onPick: (date: string) => void;
}) {
  return (
    <View style={styles.spine}>
      {weekDots(sessions).map((d) => {
        const isSel = d.date === selected;
        return (
          <Pressable
            key={d.date}
            onPress={() => {
              selectionHaptic();
              onPick(d.date);
            }}
            style={styles.dayCol}
            accessibilityRole="button"
            accessibilityLabel={`${d.label}, ${d.rest ? "rest day" : `intensity ${d.intensity}`}`}
          >
            <Text style={[styles.dayLetter, isSel && styles.dayLetterOn]}>{d.label}</Text>
            <View
              style={[
                styles.dot,
                d.rest ? styles.dotRest : { backgroundColor: bio.coralAlpha(0.25 + d.intensity / 160) },
                d.completed && styles.dotDone,
                isSel && styles.dotSel,
              ]}
            />
            {d.date === today ? <View style={styles.todayTick} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function SessionCard({
  session,
  isToday,
  busy,
  onToggle,
  onFeedback,
}: {
  session: Session;
  isToday: boolean;
  busy: boolean;
  onToggle: (slug: string, done: boolean) => void;
  onFeedback: (f: SessionFeedback) => void;
}) {
  const doneCount = session.items.filter((i) => i.done).length;

  if (session.rest) {
    return (
      <View style={styles.restCard}>
        <Text style={styles.restTitle}>{isToday ? "Rest today" : "Rest day"}</Text>
        {/* Computed from the user's own readiness — never a guess. */}
        <Text style={styles.restBody}>{session.rationale}</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text style={styles.heroTitle}>{session.title}</Text>
            <Text style={styles.heroMeta}>
              {session.items.length} exercises · {doneCount}/{session.items.length} done
            </Text>
          </View>
          <IntensityRing value={session.intensity} />
        </View>
        <Text style={styles.why}>{session.rationale}</Text>
      </View>

      <Text style={styles.sectionLabel}>THIS SESSION</Text>
      <View style={styles.list}>
        {session.items.map((item, i) => (
          <Pressable
            key={item.slug}
            onPress={() => onToggle(item.slug, !item.done)}
            style={({ pressed }) => [
              styles.row,
              i === session.items.length - 1 && styles.rowLast,
              pressed && styles.pressed,
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={`${item.name}, ${formatSetsReps(item)}`}
          >
            <View style={[styles.check, item.done && styles.checkOn]}>
              {item.done ? (
                <Svg width={11} height={9} viewBox="0 0 11 9" fill="none">
                  <Path
                    d="M1 4.6 L4 7.5 L10 1.5"
                    stroke={bio.color.ink}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              ) : null}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.rowName, item.done && styles.rowNameDone]}>{item.name}</Text>
              <Text style={styles.rowTarget}>{item.target}</Text>
            </View>
            <Text style={styles.rowSets}>{formatSetsReps(item)}</Text>
          </Pressable>
        ))}
      </View>

      {session.completed ? (
        <View style={styles.ratedBand}>
          <Text style={styles.ratedText}>
            Rated {FEEDBACK.find((f) => f.value === session.feedback)?.label.toLowerCase() ?? "done"}.
            It shapes next week, not this one.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>HOW DID THAT FEEL?</Text>
          <View style={styles.pills}>
            {FEEDBACK.map((f) => (
              <Pressable
                key={f.value}
                onPress={() => onFeedback(f.value)}
                disabled={busy}
                style={({ pressed }) => [styles.pill, pressed && !busy && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.pillText}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </>
  );
}

/** Intensity as an arc. Keyed to today's readiness, per the brief. */
function IntensityRing({ value }: { value: number }) {
  const size = bio.fitness.ring;
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={bio.alpha(0.08)} strokeWidth={3} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={bio.color.coral}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

/** The brief's empty state — we do not invent a goal on the user's behalf. */
function NoGoal({ onSetGoal }: { onSetGoal: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Set a goal and I&apos;ll build your week.</Text>
      <Text style={styles.emptyBody}>
        Your plan is built from what you&apos;re training for and how recovered you are — so it needs
        a goal first. Nothing is generated until you set one.
      </Text>
      <Pressable
        onPress={() => {
          pressHaptic();
          onSetGoal();
        }}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>Set a goal</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, flexGrow: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },

  header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 18 },
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

  spine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: bio.radius.sm,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.alpha(0.09),
  },
  dayCol: { alignItems: "center", gap: 8, width: 34 },
  dayLetter: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: bio.alpha(0.4),
  },
  dayLetterOn: { color: bio.color.text },
  dot: {
    width: bio.fitness.dot,
    height: bio.fitness.dot,
    borderRadius: bio.fitness.dot / 2,
    backgroundColor: bio.coralAlpha(0.3),
  },
  dotRest: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: bio.alpha(0.18) },
  dotDone: { borderWidth: 2, borderColor: bio.color.coralLt },
  dotSel: { transform: [{ scale: 1.35 }] },
  todayTick: { width: 4, height: 4, borderRadius: 2, backgroundColor: bio.alpha(0.5) },

  hero: {
    marginTop: 16,
    padding: 16,
    borderRadius: bio.fitness.cardRadius,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroTitle: { fontFamily: fontFamily.bold, fontSize: 19, letterSpacing: -0.19, color: bio.color.text },
  heroMeta: { fontFamily: fontFamily.light, fontSize: 12, color: bio.alpha(0.5), marginTop: 4 },
  why: {
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.color.coralLt,
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: bio.alpha(0.08),
  },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 22,
    marginBottom: 10,
  },
  list: {
    borderRadius: 18,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.alpha(0.09),
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 11,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.07),
  },
  rowLast: { borderBottomColor: "transparent" },
  check: {
    width: bio.fitness.check,
    height: bio.fitness.check,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: bio.alpha(0.22),
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: bio.color.coralLt, borderColor: bio.color.coralLt },
  rowName: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text },
  rowNameDone: { color: bio.alpha(0.45), textDecorationLine: "line-through" },
  rowTarget: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.45), marginTop: 2 },
  rowSets: { fontFamily: fontFamily.dotBold, fontSize: 14, color: bio.alpha(0.8) },

  pills: { flexDirection: "row", gap: 9 },
  pill: {
    flex: 1,
    height: 44,
    borderRadius: bio.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: bio.coralAlpha(0.1),
    borderWidth: 1,
    borderColor: bio.coralAlpha(0.32),
  },
  pillText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.color.coralLt },

  ratedBand: {
    marginTop: 16,
    padding: 13,
    borderRadius: bio.radius.sm,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  ratedText: { fontFamily: fontFamily.light, fontSize: 12.5, lineHeight: 18, color: bio.alpha(0.7) },

  restCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: bio.fitness.cardRadius,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
  },
  restTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: bio.color.text },
  restBody: {
    fontFamily: fontFamily.light,
    fontSize: 13,
    lineHeight: 20,
    color: bio.alpha(0.6),
    marginTop: 8,
  },

  rebuild: { alignSelf: "flex-start", marginTop: 24, paddingVertical: 6 },
  rebuildText: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.alpha(0.6) },
  rebuildNote: {
    fontFamily: fontFamily.light,
    fontSize: 11.5,
    lineHeight: 17,
    color: bio.alpha(0.4),
    marginTop: 4,
  },

  empty: { marginTop: 40 },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 19, lineHeight: 26, color: bio.color.text },
  emptyBody: {
    fontFamily: fontFamily.light,
    fontSize: 13,
    lineHeight: 20,
    color: bio.alpha(0.55),
    marginTop: 10,
  },
  cta: {
    height: 52,
    borderRadius: 15,
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: bio.coralAlpha(0.14),
    borderWidth: 1,
    borderColor: bio.coralAlpha(0.4),
  },
  ctaText: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: bio.color.coralLt },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
