/**
 * From your trainer — the client's window into their coaching: the current
 * week's plan and the notes a trainer has chosen to share. Read-only.
 *
 * Notes are the whole point of this screen (the client couldn't see them before
 * — they were written on the trainer side and never surfaced here). An unshared
 * note never reaches the API, so anything shown here is meant for them to read.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { bio, fontFamily } from "../../ui/theme";
import { dateLabel } from "../../lib/format";
import { fetchTrainerFeed, type SharedNote, type SharedPlan, type TrainerFeed } from "./myTrainerApi";

/** "2026-W30" → "Week 30" */
function weekLabel(iso: string): string {
  return `Week ${Number(iso.slice(-2))}`;
}

export function MyTrainerScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<TrainerFeed | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setFeed(await fetchTrainerFeed());
    } catch {
      // Emptying the feed here told the client their trainer had written them
      // nothing, which is a claim about another person — and the wrong one.
      setFailed(true);
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

  const plan = feed?.plans[0] ?? null;
  const notes = feed?.notes ?? [];
  const empty = feed !== null && !plan && notes.length === 0;

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.teal, size: 420, cx: true, top: -60, stops: [{ o: 0, a: 0.24 }, { o: 60, a: 0.09 }, { o: 72, a: 0 }], variant: "a" },
          { hue: bio.aurora.violet, size: 300, right: -120, bottom: 150, stops: [{ o: 0, a: 0.12 }, { o: 70, a: 0 }], variant: "b", delayMs: -5000 },
        ]}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.color.text} />
        }
      >
        <ScreenHeader title="From your trainer" label="Plans & notes" onBack={onBack} />

        {feed === null ? (
          <View style={styles.centre}>
            {failed ? (
              <LoadFailed what="what your trainer shared" onRetry={() => void load()} />
            ) : (
              <Spinner tint={bio.color.text} />
            )}
          </View>
        ) : empty ? (
          <View style={styles.centre}>
            <Text style={styles.emptyTitle}>Nothing shared yet</Text>
            <Text style={styles.emptyBody}>
              When your trainer shares a plan or writes you a note, it’ll appear here.
            </Text>
          </View>
        ) : (
          <>
            {plan ? (
              <>
                <Text style={styles.sectionLabel}>THIS WEEK’S PLAN</Text>
                <PlanCard plan={plan} />
              </>
            ) : null}

            {notes.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, styles.notesLabel]}>NOTES</Text>
                <View style={styles.notes}>
                  {notes.map((n) => (
                    <NoteCard key={n.id} note={n} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PlanCard({ plan }: { plan: SharedPlan }) {
  return (
    <View style={styles.planCard}>
      <View style={styles.planHead}>
        <Text style={styles.planTitle}>{plan.title}</Text>
        <Text style={styles.planWeek}>{weekLabel(plan.week)}</Text>
      </View>
      <Text style={styles.from}>from {plan.from}</Text>

      <View style={styles.exercises}>
        {plan.items.map((ex, i) => (
          <View key={i} style={[styles.exerciseRow, i === plan.items.length - 1 && styles.exerciseRowLast]}>
            <Text style={styles.exerciseName} numberOfLines={1}>
              {ex.name}
            </Text>
            <Text style={styles.exerciseReps}>
              {ex.sets} × {ex.reps}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NoteCard({ note }: { note: SharedNote }) {
  return (
    <View style={styles.noteCard}>
      <Text style={styles.noteBody}>{note.body}</Text>
      <View style={styles.noteMeta}>
        <Text style={styles.noteFrom}>{note.from}</Text>
        <Text style={styles.noteDate}>{dateLabel(new Date(note.createdAt))}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, flexGrow: 1 },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: bio.color.text },
  emptyBody: {
    fontFamily: fontFamily.light,
    fontSize: 13.5,
    lineHeight: 21,
    color: bio.alpha(0.55),
    textAlign: "center",
    maxWidth: 280,
    marginTop: 8,
  },

  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 22,
    marginBottom: 10,
  },
  notesLabel: { marginTop: 24 },

  planCard: {
    borderRadius: bio.radius.card,
    backgroundColor: bio.tealAlpha(0.07),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.24),
    padding: 16,
  },
  planHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  planTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: 17, letterSpacing: -0.17, color: bio.color.text },
  planWeek: { fontFamily: fontFamily.dotBold, fontSize: 13, letterSpacing: 0.5, color: bio.color.tealLt },
  from: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.45), marginTop: 3 },
  exercises: { marginTop: 12 },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: bio.alpha(0.08),
  },
  exerciseRowLast: {},
  exerciseName: { flex: 1, fontFamily: fontFamily.medium, fontSize: 14, color: bio.alpha(0.9) },
  exerciseReps: { fontFamily: fontFamily.dot, fontSize: 14, letterSpacing: 0.5, color: bio.color.text },

  notes: { gap: 10 },
  noteCard: {
    borderRadius: bio.radius.card,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    padding: 16,
  },
  noteBody: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21, color: bio.color.text },
  noteMeta: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: bio.alpha(0.08),
  },
  noteFrom: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.color.tealLt },
  noteDate: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.45) },
});
