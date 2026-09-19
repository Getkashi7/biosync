/**
 * A coach's own classes — scheduling one, calling one off, and seeing who's
 * coming.
 *
 * This lives in the professional shell, and it is the only way a class comes
 * into existence at all: a class is created by the person who will teach it,
 * never by an admin. An admin who needs to schedule one is granted the trainer
 * capability through the flow that already exists, which is the honest shape
 * rather than a special case in the middle of the authorization model.
 *
 * **Cancelling asks for a reason, and the reason is not optional.** The server
 * requires five characters; everyone who had booked sees what it said. A
 * cancellation with no explanation is a notification, and a notification is not
 * what somebody who reorganised their evening is owed.
 *
 * **The roster is names.** No readings, no notes, nothing from anybody's
 * record. A coach who is also somebody's linked trainer reads their data
 * through the staff surface, where a link and a consent are both checked — a
 * class list is not a way around that.
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
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, pressHaptic, successHaptic } from "../../lib/haptics";
import { classRange, groupByDay, localDay } from "../../lib/gymFormat";
import {
  cancelClass,
  createClass,
  fetchMyClasses,
  fetchRoster,
  fetchVenues,
  type MyClass,
  type Roster,
  type Venue,
} from "./gymApi";

/** The server accepts 5–300; anything shorter is not an explanation. */
const MIN_REASON = 5;

type Draft = {
  venueId: string;
  title: string;
  date: string;
  time: string;
  durationMin: string;
  capacity: string;
};

const BLANK: Draft = {
  venueId: "",
  title: "",
  date: localDay(),
  time: "18:00",
  durationMin: "45",
  capacity: "12",
};

export function CoachClassesScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [classes, setClasses] = useState<MyClass[] | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; reason: string } | null>(null);
  const [roster, setRoster] = useState<{ id: string; data: Roster | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which picker is open, if any. Android renders these as modals, so they are
  // mounted on demand and dismissed by their own onChange.
  const [picker, setPicker] = useState<"date" | "time" | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setClasses(await fetchMyClasses());
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        setVenues(await fetchVenues());
      } catch {
        // The form says so when the list is empty; losing it must not take the
        // class list down too.
      }
    })();
  }, []);

  const save = useCallback(async () => {
    if (!draft || busy) return;
    setError(null);

    if (!draft.venueId) return setError("Pick a venue.");
    if (draft.title.trim().length < 2) return setError("Give the class a name.");

    const startsAt = toInstant(draft.date, draft.time);
    if (!startsAt) return setError("Use a date like 2026-09-20 and a time like 18:00.");

    const durationMin = Number(draft.durationMin);
    const capacity = Number(draft.capacity);
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 300) {
      return setError("Length must be between 5 and 300 minutes.");
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) {
      return setError("Capacity must be between 1 and 200.");
    }

    setBusy(true);
    try {
      await createClass({
        venueId: draft.venueId,
        title: draft.title.trim(),
        startsAt,
        durationMin,
        capacity,
      });
      successHaptic();
      setDraft(null);
      await load();
    } catch (e) {
      errorHaptic();
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }, [busy, draft, load]);

  const confirmCancel = useCallback(async () => {
    if (!cancelling || busy) return;
    if (cancelling.reason.trim().length < MIN_REASON) {
      setError("Say why — everyone who booked will see it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const n = await cancelClass(cancelling.id, cancelling.reason.trim());
      successHaptic();
      setCancelling(null);
      // The count is worth saying out loud: it is how many evenings changed.
      setError(n > 0 ? `Cancelled. ${n} booking${n === 1 ? "" : "s"} were cancelled too.` : null);
      await load();
    } catch (e) {
      errorHaptic();
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }, [busy, cancelling, load]);

  const openRoster = useCallback(async (id: string) => {
    setRoster({ id, data: null });
    try {
      setRoster({ id, data: await fetchRoster(id) });
    } catch {
      setRoster(null);
      setError("Couldn't load that roster.");
    }
  }, []);

  const days = groupByDay(classes ?? []);

  return (
    <View style={styles.root}>
      <StaticBloom color={bio.color.teal} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="Your classes" label="Coach" onBack={onBack} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {draft ? (
            <View style={styles.form}>
              <Text style={styles.formTitle}>New class</Text>

              {venues.length === 0 ? (
                <Text style={styles.noVenues}>
                  No venues have been set up yet. An admin adds them — a class
                  belongs to a place.
                </Text>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>VENUE</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chips}
                  >
                    {venues.map((v) => (
                      <Pressable
                        key={v.id}
                        onPress={() => {
                          pressHaptic();
                          setDraft({ ...draft, venueId: v.id });
                        }}
                        style={({ pressed }) => [
                          styles.chip,
                          draft.venueId === v.id && styles.chipOn,
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: draft.venueId === v.id }}
                        accessibilityLabel={v.name}
                      >
                        <Text
                          style={[styles.chipText, draft.venueId === v.id && styles.chipTextOn]}
                        >
                          {v.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <Field
                label="NAME"
                value={draft.title}
                onChange={(v) => setDraft({ ...draft, title: v })}
                placeholder="Intervals"
              />
              <View style={styles.pair}>
                <PickerField
                  label="DATE"
                  value={draft.date}
                  onPress={() => {
                    pressHaptic();
                    setPicker("date");
                  }}
                />
                <PickerField
                  label="TIME"
                  value={draft.time}
                  onPress={() => {
                    pressHaptic();
                    setPicker("time");
                  }}
                />
              </View>
              <View style={styles.pair}>
                <Field
                  label="MINUTES"
                  value={draft.durationMin}
                  onChange={(v) => setDraft({ ...draft, durationMin: v })}
                  placeholder="45"
                  numeric
                  half
                />
                <Field
                  label="CAPACITY"
                  value={draft.capacity}
                  onChange={(v) => setDraft({ ...draft, capacity: v })}
                  placeholder="12"
                  numeric
                  half
                />
              </View>
              <Text style={styles.fieldHint}>
                The time is the time in the room. Capacity is enforced when people
                book, so the last seat can only be taken once.
              </Text>

              <View style={styles.formBtns}>
                <Pressable
                  onPress={() => {
                    pressHaptic();
                    setDraft(null);
                    setError(null);
                  }}
                  style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void save()}
                  disabled={busy || venues.length === 0}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressed,
                    (busy || venues.length === 0) && styles.btnOff,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Schedule this class"
                  accessibilityState={{ disabled: busy || venues.length === 0 }}
                >
                  <Text style={styles.primaryBtnText}>{busy ? "…" : "Schedule"}</Text>
                </Pressable>
              </View>

              {picker ? (
                <DateTimePicker
                  mode={picker}
                  display={picker === "date" ? "calendar" : "clock"}
                  value={draftDate(draft)}
                  minimumDate={picker === "date" ? new Date() : undefined}
                  onChange={(e: DateTimePickerEvent, d?: Date) => {
                    const which = picker;
                    setPicker(null);
                    // "dismissed" means they backed out — keep what was there
                    // rather than writing today's date over their choice.
                    if (e.type !== "set" || !d) return;
                    setDraft(
                      which === "date"
                        ? { ...draft, date: localDay(d) }
                        : {
                            ...draft,
                            time: `${String(d.getHours()).padStart(2, "0")}:${String(
                              d.getMinutes(),
                            ).padStart(2, "0")}`,
                          },
                    );
                  }}
                />
              ) : null}
            </View>
          ) : (
            <Pressable
              onPress={() => {
                pressHaptic();
                setDraft({ ...BLANK, venueId: venues[0]?.id ?? "" });
                setError(null);
              }}
              style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Schedule a class"
            >
              <Text style={styles.addBtnText}>Schedule a class</Text>
            </Pressable>
          )}

          {failed ? (
            <LoadFailed what="your classes" kind={failed} onRetry={() => void load()} />
          ) : classes === null ? (
            <View style={styles.loading}>
              <Spinner tint={bio.color.text} />
            </View>
          ) : classes.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing scheduled</Text>
              <Text style={styles.emptyBody}>
                Classes you schedule in the next two weeks show up here.
              </Text>
            </View>
          ) : (
            days.map((day) => (
              <View key={day.heading}>
                <Text style={styles.dayHeading}>{day.heading.toUpperCase()}</Text>
                {day.rows.map((c) => (
                  <View key={c.id} style={[styles.card, c.state === "CANCELLED" && styles.cardOff]}>
                    <View style={styles.cardTop}>
                      <Text style={styles.time}>{classRange(c.startsAt, c.durationMin)}</Text>
                      <Text style={styles.count}>
                        {c.booked}/{c.capacity}
                      </Text>
                    </View>
                    <Text style={styles.title} numberOfLines={2}>
                      {c.title}
                    </Text>
                    <Text style={styles.meta}>{c.venue.name}</Text>

                    {c.state === "CANCELLED" ? (
                      <Text style={styles.cancelled}>
                        Cancelled{c.cancelReason ? ` — ${c.cancelReason}` : ""}
                      </Text>
                    ) : cancelling?.id === c.id ? (
                      <View style={styles.confirm}>
                        <Text style={styles.confirmTitle}>Why is it off?</Text>
                        <TextInput
                          value={cancelling.reason}
                          onChangeText={(v) => setCancelling({ id: c.id, reason: v })}
                          placeholder="Everyone who booked will see this"
                          placeholderTextColor={bio.alpha(0.3)}
                          style={styles.reasonInput}
                          multiline
                          selectionColor={bio.color.teal}
                          accessibilityLabel="Reason for cancelling"
                        />
                        <View style={styles.formBtns}>
                          <Pressable
                            onPress={() => {
                              pressHaptic();
                              setCancelling(null);
                              setError(null);
                            }}
                            style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel="Keep the class"
                          >
                            <Text style={styles.ghostBtnText}>Keep it</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void confirmCancel()}
                            disabled={busy || cancelling.reason.trim().length < MIN_REASON}
                            style={({ pressed }) => [
                              styles.dangerBtn,
                              pressed && styles.pressed,
                              (busy || cancelling.reason.trim().length < MIN_REASON) &&
                                styles.btnOff,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="Confirm cancelling this class"
                          >
                            <Text style={styles.dangerBtnText}>{busy ? "…" : "Cancel class"}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : roster?.id === c.id ? (
                      <View style={styles.roster}>
                        {roster.data === null ? (
                          <Spinner tint={bio.color.tealLt} />
                        ) : roster.data.people.length === 0 ? (
                          <Text style={styles.rosterNone}>Nobody booked yet.</Text>
                        ) : (
                          roster.data.people.map((p) => (
                            <View key={p.id} style={styles.rosterRow}>
                              <Text style={styles.rosterName} numberOfLines={1}>
                                {p.name}
                              </Text>
                              <Text style={styles.rosterTag}>
                                {p.attended ? "Attended" : p.status === "CANCELLED" ? "Cancelled" : "Booked"}
                              </Text>
                            </View>
                          ))
                        )}
                        <Pressable
                          onPress={() => {
                            pressHaptic();
                            setRoster(null);
                          }}
                          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel="Hide the roster"
                        >
                          <Text style={styles.smallBtnText}>Hide</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.cardBtns}>
                        <Pressable
                          onPress={() => {
                            pressHaptic();
                            void openRoster(c.id);
                          }}
                          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel={`Who's coming to ${c.title}`}
                        >
                          <Text style={styles.smallBtnText}>Who's coming</Text>
                        </Pressable>
                        {c.state !== "PAST" ? (
                          <Pressable
                            onPress={() => {
                              pressHaptic();
                              setCancelling({ id: c.id, reason: "" });
                              setError(null);
                            }}
                            style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel={`Cancel ${c.title}`}
                          >
                            <Text style={styles.smallBtnText}>Cancel class</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * A local `YYYY-MM-DD` plus `HH:MM` as an instant.
 *
 * Built through the Date constructor's local-time form on purpose: a class at
 * 18:00 is 18:00 in the room, so the coach's own clock is the right frame to
 * read the form in. Returns null rather than an Invalid Date, which would post
 * a class to the epoch.
 */
function toInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return null;
  if (!/^\d{1,2}:\d{2}$/.test(time.trim())) return null;
  const [y, m, d] = date.trim().split("-").map(Number);
  const [hh, mm] = time.trim().split(":").map(Number);
  if (hh === undefined || mm === undefined || hh > 23 || mm > 59) return null;
  const at = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, hh, mm, 0, 0);
  if (Number.isNaN(at.getTime())) return null;
  // Round-trip the date so 2026-02-31 is refused rather than rolling into March.
  if (at.getMonth() !== (m ?? 1) - 1 || at.getDate() !== d) return null;
  return at.toISOString();
}

/**
 * The draft's date and time as a Date, for seeding a picker.
 *
 * Falls back to now rather than to an Invalid Date, which a picker renders as
 * 1970 and which a user then has to scroll out of.
 */
function draftDate(draft: Draft): Date {
  const iso = toInstant(draft.date, draft.time);
  return iso ? new Date(iso) : new Date();
}

function PickerField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View style={[styles.field, styles.fieldHalf]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pickerBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}. Tap to change.`}
      >
        <Text style={styles.pickerValue}>{value}</Text>
      </Pressable>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  half,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  numeric?: boolean;
  half?: boolean;
}) {
  return (
    <View style={[styles.field, half && styles.fieldHalf]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={bio.alpha(0.3)}
        style={styles.fieldInput}
        autoCapitalize={numeric ? "none" : "sentences"}
        autoCorrect={false}
        keyboardType={numeric ? "number-pad" : "default"}
        selectionColor={bio.color.teal}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20 },
  pressed: { transform: [{ scale: 0.97 }] },

  error: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.coralLt, marginTop: 14 },

  addBtn: {
    marginTop: 16,
    marginBottom: 12,
    paddingVertical: 13,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.45),
    backgroundColor: bio.tealAlpha(0.12),
    alignItems: "center",
  },
  addBtnText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.tealLt },

  form: {
    marginTop: 16,
    marginBottom: 20,
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.card,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    padding: 16,
  },
  formTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: bio.color.text,
    marginBottom: 14,
  },
  noVenues: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: bio.color.amberLt,
    marginBottom: 14,
    lineHeight: 19,
  },
  chips: { gap: 8, paddingBottom: 14, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.hairline,
  },
  chipOn: { borderColor: bio.tealAlpha(0.55), backgroundColor: bio.tealAlpha(0.12) },
  chipText: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.6) },
  chipTextOn: { color: bio.color.tealLt },

  pair: { flexDirection: "row", gap: 12 },
  field: { marginBottom: 12 },
  fieldHalf: { flex: 1 },
  fieldLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    color: bio.alpha(0.38),
    marginBottom: 5,
  },
  fieldInput: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: bio.color.text,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.13),
    paddingVertical: 8,
  },
  pickerBtn: {
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.13),
    paddingVertical: 10,
  },
  pickerValue: { fontFamily: fontFamily.regular, fontSize: 15, color: bio.color.text },
  fieldHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: bio.alpha(0.33),
    lineHeight: 16,
    marginBottom: 14,
  },
  formBtns: { flexDirection: "row", gap: 10, marginTop: 4 },

  dayHeading: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: bio.alpha(0.42),
    marginTop: 20,
    marginBottom: 10,
  },

  card: {
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.card,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    padding: 16,
    marginBottom: 10,
  },
  cardOff: { opacity: 0.6 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  time: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.tealLt },
  count: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.5) },
  title: { fontFamily: fontFamily.semibold, fontSize: 17, color: bio.color.text, marginTop: 8 },
  meta: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.45), marginTop: 3 },
  cancelled: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.color.coralLt, marginTop: 10 },

  cardBtns: { flexDirection: "row", gap: 8, marginTop: 14 },
  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
    alignSelf: "flex-start",
  },
  smallBtnText: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.7) },

  confirm: { marginTop: 14 },
  confirmTitle: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text },
  reasonInput: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: bio.color.text,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    borderRadius: bio.radius.xs,
    padding: 10,
    marginTop: 8,
    minHeight: 60,
    textAlignVertical: "top",
  },
  dangerBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.coralAlpha(0.16),
    borderWidth: 1,
    borderColor: bio.coralAlpha(0.45),
  },
  dangerBtnText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.coralLt },
  primaryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.color.tealDeep,
  },
  primaryBtnText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.onTeal },
  ghostBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
  },
  ghostBtnText: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.alpha(0.65) },
  btnOff: { opacity: 0.45 },

  roster: { marginTop: 14 },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: bio.color.hairline,
  },
  rosterName: { fontFamily: fontFamily.regular, fontSize: 14, color: bio.color.text, flex: 1 },
  rosterTag: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.45) },
  rosterNone: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.4) },

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
