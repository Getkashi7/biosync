/**
 * A coach's own classes (§6) — built to the A5 handoff.
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
 *
 * One deviation from the handoff: it draws a flat list of cards with no day
 * headings, but the query spans two weeks, so "18:00" alone does not say which
 * evening. Day headings are kept, in A1's style — the same bundle already
 * establishes them, and a scheduling screen that hides the day is worse than an
 * extra label.
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
import { RadialBloom } from "../../ui/bio/RadialBloom";
import { FlatHeader } from "../../ui/bio/FlatHeader";
import { Spinner } from "../../ui/Spinner";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, pressHaptic, successHaptic } from "../../lib/haptics";
import { classRange, groupByDay, localDay, ymdLabel } from "../../lib/gymFormat";
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
  // Android renders these as modals, so they mount on demand and dismiss
  // through their own onChange.
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
    if (!startsAt) return setError("That date and time don't look right.");

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
      <RadialBloom
        color={bio.color.teal}
        size={bio.gym.bloom.size}
        left={bio.gym.bloom.left}
        top={bio.gym.bloom.top}
        alpha={bio.gym.bloom.alpha}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={[styles.frame, { paddingTop: insets.top + 20 }]}>
          <FlatHeader title="Your classes" label="Coach" onBack={onBack} />

          {failed ? (
            <View style={styles.centre}>
              <Text style={styles.bigTitle}>Couldn't load your classes</Text>
              <Text style={styles.bigBody}>
                {failed === "offline"
                  ? "You look offline. Check your connection — nothing has been lost."
                  : "Something went wrong on our end. Nothing has been lost."}
              </Text>
              <Pressable
                onPress={() => {
                  pressHaptic();
                  void load();
                }}
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Try loading your classes again"
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {draft ? null : (
                <Pressable
                  onPress={() => {
                    pressHaptic();
                    setDraft({ ...BLANK, venueId: venues[0]?.id ?? "" });
                    setError(null);
                  }}
                  style={({ pressed }) => [styles.scheduleBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Schedule a class"
                >
                  <Text style={styles.scheduleBtnText}>Schedule a class</Text>
                </Pressable>
              )}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {draft ? (
                <View style={styles.form}>
                  {venues.length === 0 ? (
                    <Text style={styles.noVenues}>
                      No venues have been set up yet. An admin adds them — a class belongs
                      to a place.
                    </Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chips}
                      style={styles.chipRow}
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
                            style={[
                              styles.chipText,
                              draft.venueId === v.id && styles.chipTextOn,
                            ]}
                          >
                            {v.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}

                  <Text style={styles.fieldLabel}>NAME</Text>
                  <TextInput
                    value={draft.title}
                    onChangeText={(v) => setDraft({ ...draft, title: v })}
                    placeholder="Box fundamentals"
                    placeholderTextColor={bio.alpha(0.3)}
                    style={styles.input}
                    autoCorrect={false}
                    selectionColor={bio.color.teal}
                    accessibilityLabel="Class name"
                  />

                  <View style={styles.pair}>
                    <PickerField
                      label="DATE"
                      value={ymdLabel(draft.date)}
                      onPress={() => {
                        pressHaptic();
                        setPicker("date");
                      }}
                    />
                    <PickerField
                      label="TIME"
                      value={draft.time}
                      numeric
                      onPress={() => {
                        pressHaptic();
                        setPicker("time");
                      }}
                    />
                  </View>

                  <View style={styles.pair}>
                    <BoxField
                      label="MINUTES"
                      value={draft.durationMin}
                      onChange={(v) => setDraft({ ...draft, durationMin: v })}
                    />
                    <BoxField
                      label="CAPACITY"
                      value={draft.capacity}
                      onChange={(v) => setDraft({ ...draft, capacity: v })}
                    />
                  </View>

                  <Text style={styles.formHint}>
                    Members at the venue see it as soon as you schedule it.
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
                        // "dismissed" means they backed out — keep what was
                        // there rather than writing today over their choice.
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
              ) : null}

              {classes === null ? (
                <View style={styles.loading}>
                  <Spinner tint={bio.color.teal} />
                </View>
              ) : classes.length === 0 && !draft ? (
                <View style={styles.centre}>
                  <Text style={styles.bigTitle}>No classes scheduled</Text>
                </View>
              ) : (
                days.map((day) => (
                  <View key={day.heading}>
                    <Text style={styles.dayHeading}>{day.heading.toUpperCase()}</Text>
                    {day.rows.map((c, i) => (
                      <View
                        key={c.id}
                        style={[
                          styles.card,
                          i === 0 ? styles.cardFirst : styles.cardNext,
                          c.state === "CANCELLED" && styles.cardOff,
                        ]}
                      >
                        <View style={styles.cardTop}>
                          <Text style={styles.time}>
                            {classRange(c.startsAt, c.durationMin)}
                          </Text>
                          <Text style={styles.count}>
                            {c.booked}/{c.capacity}
                          </Text>
                        </View>
                        <Text style={styles.title} numberOfLines={2}>
                          {c.title}
                        </Text>
                        <Text style={styles.venue} numberOfLines={1}>
                          {c.venue.name}
                        </Text>

                        {c.state === "CANCELLED" ? (
                          <Text style={styles.cancelled}>
                            Cancelled{c.cancelReason ? ` — ${c.cancelReason}` : ""}
                          </Text>
                        ) : cancelling?.id === c.id ? (
                          <>
                            <Text style={styles.whyTitle}>Why is it off?</Text>
                            <TextInput
                              value={cancelling.reason}
                              onChangeText={(v) => setCancelling({ id: c.id, reason: v })}
                              placeholder="Everyone who booked will see this"
                              placeholderTextColor={bio.alpha(0.35)}
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
                                style={({ pressed }) => [
                                  styles.ghostBtn,
                                  pressed && styles.pressed,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel="Keep the class"
                              >
                                <Text style={styles.ghostBtnText}>Keep it</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => void confirmCancel()}
                                disabled={
                                  busy || cancelling.reason.trim().length < MIN_REASON
                                }
                                style={({ pressed }) => [
                                  styles.dangerBtn,
                                  pressed && styles.pressed,
                                  (busy || cancelling.reason.trim().length < MIN_REASON) &&
                                    styles.btnOff,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel="Confirm cancelling this class"
                              >
                                <Text style={styles.dangerBtnText}>
                                  {busy ? "…" : "Cancel class"}
                                </Text>
                              </Pressable>
                            </View>
                          </>
                        ) : roster?.id === c.id ? (
                          <>
                            <View style={styles.roster}>
                              {roster.data === null ? (
                                <View style={styles.rosterLoading}>
                                  <Spinner tint={bio.color.teal} />
                                </View>
                              ) : roster.data.people.length === 0 ? (
                                <Text style={styles.rosterNone}>Nobody booked yet.</Text>
                              ) : (
                                roster.data.people.map((pn, k) => (
                                  <View
                                    key={pn.id}
                                    style={[
                                      styles.rosterRow,
                                      k === (roster.data?.people.length ?? 0) - 1 &&
                                        styles.rosterRowLast,
                                    ]}
                                  >
                                    <Text style={styles.rosterName} numberOfLines={1}>
                                      {pn.name}
                                    </Text>
                                    <Text
                                      style={
                                        pn.attended
                                          ? styles.tagAttended
                                          : pn.status === "CANCELLED"
                                            ? styles.tagCancelled
                                            : styles.tag
                                      }
                                    >
                                      {pn.attended
                                        ? "Attended"
                                        : pn.status === "CANCELLED"
                                          ? "Cancelled"
                                          : "Booked"}
                                    </Text>
                                  </View>
                                ))
                              )}
                            </View>
                            <View style={styles.hideRow}>
                              <Pressable
                                onPress={() => {
                                  pressHaptic();
                                  setRoster(null);
                                }}
                                style={({ pressed }) => [
                                  styles.cardBtn,
                                  pressed && styles.pressed,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel="Hide the roster"
                              >
                                <Text style={styles.cardBtnText}>Hide</Text>
                              </Pressable>
                            </View>
                          </>
                        ) : (
                          <View style={styles.cardBtns}>
                            <Pressable
                              onPress={() => {
                                pressHaptic();
                                void openRoster(c.id);
                              }}
                              style={({ pressed }) => [styles.cardBtn, pressed && styles.pressed]}
                              accessibilityRole="button"
                              accessibilityLabel={`Who's coming to ${c.title}`}
                            >
                              <Text style={styles.cardBtnText}>Who's coming</Text>
                            </Pressable>
                            {c.state !== "PAST" ? (
                              <Pressable
                                onPress={() => {
                                  pressHaptic();
                                  setCancelling({ id: c.id, reason: "" });
                                  setError(null);
                                }}
                                style={({ pressed }) => [
                                  styles.cardBtn,
                                  pressed && styles.pressed,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={`Cancel ${c.title}`}
                              >
                                <Text style={styles.cardBtnText}>Cancel class</Text>
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
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The draft's date and time as a Date, for seeding a picker.
 *
 * Falls back to now rather than to an Invalid Date, which a picker renders as
 * 1970 and which the coach then has to scroll out of.
 */
function draftDate(draft: Draft): Date {
  const iso = toInstant(draft.date, draft.time);
  return iso ? new Date(iso) : new Date();
}

/**
 * A local `YYYY-MM-DD` plus `HH:MM` as an instant.
 *
 * Built through the Date constructor's local form on purpose: a class at 18:00
 * is 18:00 in the room, so the coach's own clock is the right frame. Returns
 * null rather than an Invalid Date, which would post a class to the epoch.
 */
function toInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return null;
  if (!/^\d{1,2}:\d{2}$/.test(time.trim())) return null;
  const [y, m, d] = date.trim().split("-").map(Number);
  const [hh, mm] = time.trim().split(":").map(Number);
  if (hh === undefined || mm === undefined || hh > 23 || mm > 59) return null;
  const at = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, hh, mm, 0, 0);
  if (Number.isNaN(at.getTime())) return null;
  // Round-trip, so 2026-02-31 is refused rather than rolling into March.
  if (at.getMonth() !== (m ?? 1) - 1 || at.getDate() !== d) return null;
  return at.toISOString();
}

function PickerField({
  label,
  value,
  numeric,
  onPress,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.half}>
      <Text style={styles.fieldLabelTight}>{label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pickerBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}. Tap to change.`}
      >
        <Text style={[styles.pickerValue, numeric && styles.tabular]}>{value}</Text>
      </Pressable>
    </View>
  );
}

function BoxField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.half}>
      <Text style={styles.fieldLabelTight}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={[styles.input, styles.inputTight, styles.tabular]}
        keyboardType="number-pad"
        selectionColor={bio.color.teal}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  flex: { flex: 1 },
  frame: { flex: 1, paddingHorizontal: 18 },
  pressed: { transform: [{ scale: 0.97 }] },
  tabular: { fontVariant: ["tabular-nums"] },

  scheduleBtn: {
    marginTop: 16,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.45),
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleBtnText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.teal },

  error: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.coral, marginTop: 14 },

  form: {
    marginTop: 16,
    backgroundColor: bio.color.surface,
    borderRadius: bio.gym.card.radius,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    padding: 18,
  },
  noVenues: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19.5,
    color: bio.color.amberLt,
  },
  chipRow: { flexGrow: 0 },
  chips: { gap: 8, paddingRight: 8 },
  chip: {
    paddingVertical: bio.gym.filterChip.padV,
    paddingHorizontal: bio.gym.filterChip.padH,
    borderRadius: bio.gym.filterChip.radius,
    borderWidth: 1,
    borderColor: bio.alpha(0.13),
  },
  chipOn: { borderColor: bio.tealAlpha(0.38), backgroundColor: bio.tealAlpha(0.12) },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: bio.gym.filterChip.size,
    color: bio.alpha(0.55),
  },
  chipTextOn: { fontFamily: fontFamily.semibold, color: bio.color.teal },

  fieldLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: bio.alpha(0.38),
    marginTop: 18,
  },
  fieldLabelTight: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: bio.alpha(0.38),
  },
  input: {
    marginTop: 8,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.08),
    borderRadius: bio.gym.input.radius,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: bio.alpha(0.94),
  },
  inputTight: { marginTop: 8 },

  pair: { flexDirection: "row", gap: 16, marginTop: 18 },
  half: { flex: 1 },
  pickerBtn: {
    marginTop: 6,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.2),
  },
  pickerValue: { fontFamily: fontFamily.semibold, fontSize: 15, color: bio.alpha(0.94) },

  formHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: bio.alpha(0.33),
    marginTop: 16,
  },
  formBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  ghostBtn: {
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: bio.alpha(0.18),
  },
  ghostBtnText: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.alpha(0.82) },
  primaryBtn: {
    paddingVertical: 9,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: bio.color.teal,
  },
  primaryBtnText: { fontFamily: fontFamily.bold, fontSize: 13, color: bio.color.onTealSolid },
  dangerBtn: {
    paddingVertical: 9,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: bio.color.coral,
  },
  dangerBtnText: { fontFamily: fontFamily.bold, fontSize: 13, color: bio.color.onCoral },
  btnOff: { opacity: 0.45 },

  dayHeading: {
    fontFamily: fontFamily.semibold,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: bio.alpha(0.38),
    marginTop: 20,
    marginBottom: 2,
  },

  card: {
    backgroundColor: bio.color.surface,
    borderRadius: bio.gym.card.radius,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  cardFirst: { marginTop: 14 },
  cardNext: { marginTop: 10 },
  cardOff: { opacity: 0.6 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  time: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
    color: bio.color.teal,
    fontVariant: ["tabular-nums"],
  },
  count: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: bio.alpha(0.7),
    fontVariant: ["tabular-nums"],
  },
  title: { fontFamily: fontFamily.semibold, fontSize: 17, color: bio.alpha(0.97), marginTop: 6 },
  venue: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.alpha(0.45), marginTop: 3 },
  cancelled: {
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    color: bio.color.coral,
    marginTop: 10,
  },

  cardBtns: { flexDirection: "row", gap: 8, marginTop: 14 },
  hideRow: { flexDirection: "row", marginTop: 8 },
  cardBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: bio.alpha(0.18),
  },
  cardBtnText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.alpha(0.82) },

  whyTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: bio.alpha(0.94),
    marginTop: 16,
  },
  reasonInput: {
    marginTop: 10,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.alpha(0.08),
    borderRadius: bio.gym.input.radius,
    paddingVertical: 12,
    paddingHorizontal: 14,
    height: 88,
    fontFamily: fontFamily.regular,
    fontSize: 13.5,
    color: bio.alpha(0.94),
    textAlignVertical: "top",
  },

  roster: { marginTop: 12, borderTopWidth: 1, borderTopColor: bio.alpha(0.07) },
  rosterLoading: { paddingVertical: 16, alignItems: "center" },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.07),
  },
  rosterRowLast: { borderBottomWidth: 0 },
  rosterName: { fontFamily: fontFamily.regular, fontSize: 14, color: bio.alpha(0.9), flex: 1 },
  rosterNone: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: bio.alpha(0.45),
    paddingVertical: 12,
  },
  tag: { fontFamily: fontFamily.medium, fontSize: 12.5, color: bio.alpha(0.5) },
  tagAttended: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.color.teal },
  tagCancelled: { fontFamily: fontFamily.medium, fontSize: 12.5, color: bio.color.coral },

  loading: { paddingVertical: 60, alignItems: "center" },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  bigTitle: { fontFamily: fontFamily.semibold, fontSize: 16.5, color: bio.alpha(0.9) },
  bigBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19.5,
    color: bio.alpha(0.45),
    marginTop: 8,
    textAlign: "center",
  },
  retry: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.42),
  },
  retryText: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.color.teal },
});
