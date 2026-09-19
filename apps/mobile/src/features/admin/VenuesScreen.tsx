/**
 * Venues (§10) — the places §6 happens in.
 *
 * A venue is platform infrastructure, so an admin owns it. A coach schedules
 * classes at a site; they do not decide the site exists, and they cannot rotate
 * its key.
 *
 * **The check-in secret is never shown, here or anywhere.** There is no read
 * path for it in the whole app: a venue display asks the server for a signed
 * token, and the key stays where it was generated. That is what makes "it never
 * leaves the server" a property of the code rather than a promise in a comment.
 *
 * **Rotate is separate from edit, deliberately.** Renaming a gym must not
 * invalidate the code on its wall — that would be a silent outage nobody would
 * connect back to the rename. Rotation is its own act, confirmed, and it stops
 * every code already out there on the next window.
 *
 * **Venues are deactivated, never deleted.** The row is `Restrict` from classes
 * and visits, because a site that closes must not take last year's attendance
 * with it.
 */
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { fetchVenues, rotateVenueSecret, saveVenue, type AdminVenue } from "./adminApi";

/** The zone a new venue defaults to — the same default the schema carries. */
const DEFAULT_TZ = "Europe/London";

type Editing = { id?: string; name: string; address: string; timezone: string; active: boolean };

const BLANK: Editing = { name: "", address: "", timezone: DEFAULT_TZ, active: true };

export function VenuesScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [venues, setVenues] = useState<AdminVenue[] | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setVenues(await fetchVenues());
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!editing || busy) return;
    const name = editing.name.trim();
    if (name.length < 2) {
      setError("A venue needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveVenue({
        ...(editing.id ? { id: editing.id } : {}),
        name,
        address: editing.address.trim() || null,
        timezone: editing.timezone.trim() || DEFAULT_TZ,
        active: editing.active,
      });
      successHaptic();
      setEditing(null);
      await load();
    } catch (e) {
      errorHaptic();
      // The server's own message: it names an unresolvable time zone rather
      // than absorbing it, because a bad zone silently becomes UTC and moves
      // every evening class a day.
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }, [busy, editing, load]);

  const rotate = useCallback(
    async (id: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await rotateVenueSecret(id);
        successHaptic();
        setRotating(null);
      } catch (e) {
        errorHaptic();
        setError(e instanceof Error ? e.message : "Couldn't rotate that key.");
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

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
          <ScreenHeader title="Venues" label="Platform" onBack={onBack} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {editing ? (
            <View style={styles.form}>
              <Text style={styles.formTitle}>{editing.id ? "Edit venue" : "New venue"}</Text>

              <Field
                label="NAME"
                value={editing.name}
                onChange={(v) => setEditing({ ...editing, name: v })}
                placeholder="Arch 12"
              />
              <Field
                label="ADDRESS"
                value={editing.address}
                onChange={(v) => setEditing({ ...editing, address: v })}
                placeholder="Optional — one line, for display"
              />
              <Field
                label="TIME ZONE"
                value={editing.timezone}
                onChange={(v) => setEditing({ ...editing, timezone: v })}
                placeholder={DEFAULT_TZ}
              />
              <Text style={styles.fieldHint}>
                An IANA zone, like Europe/London. It turns a class's stored instant
                back into the time on the wall.
              </Text>

              <View style={styles.switchRow}>
                <View style={styles.flexMin}>
                  <Text style={styles.switchLabel}>Active</Text>
                  <Text style={styles.switchHint}>
                    Turn off to retire a venue. Its past classes and visits stay.
                  </Text>
                </View>
                <Switch
                  value={editing.active}
                  onValueChange={(v) => setEditing({ ...editing, active: v })}
                  trackColor={{ false: bio.alpha(0.12), true: bio.blueAlpha(0.5) }}
                  thumbColor={bio.color.knob}
                  accessibilityLabel="Venue is active"
                />
              </View>

              <View style={styles.formBtns}>
                <Pressable
                  onPress={() => {
                    pressHaptic();
                    setEditing(null);
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
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressed,
                    busy && styles.btnOff,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Save venue"
                  accessibilityState={{ disabled: busy }}
                >
                  <Text style={styles.primaryBtnText}>{busy ? "…" : "Save"}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                pressHaptic();
                setEditing({ ...BLANK });
              }}
              style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Add a venue"
            >
              <Text style={styles.addBtnText}>Add a venue</Text>
            </Pressable>
          )}

          {failed ? (
            <LoadFailed what="the venue list" kind={failed} onRetry={() => void load()} />
          ) : venues === null ? (
            <View style={styles.loading}>
              <Spinner tint={bio.color.text} />
            </View>
          ) : venues.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No venues yet</Text>
              <Text style={styles.emptyBody}>
                Add one before scheduling a class — a class belongs to a place, and
                check-in needs somewhere to happen.
              </Text>
            </View>
          ) : (
            venues.map((v) => (
              <View key={v.id} style={[styles.card, !v.active && styles.cardOff]}>
                <View style={styles.cardTop}>
                  <View style={styles.flexMin}>
                    <Text style={styles.name} numberOfLines={1}>
                      {v.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {v.timezone}
                      {v.address ? ` · ${v.address}` : ""}
                    </Text>
                  </View>
                  {!v.active ? (
                    <View style={styles.offChip}>
                      <Text style={styles.offChipText}>RETIRED</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.counts}>
                  {v._count.classes} classes · {v._count.visits} visits
                </Text>

                {rotating === v.id ? (
                  <View style={styles.confirm}>
                    <Text style={styles.confirmTitle}>Rotate this venue's key?</Text>
                    <Text style={styles.confirmBody}>
                      Every code currently on a display here stops working within a
                      minute. Do this if a code was photographed or shared.
                    </Text>
                    <View style={styles.confirmBtns}>
                      <Pressable
                        onPress={() => void rotate(v.id)}
                        disabled={busy}
                        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Confirm rotate"
                      >
                        <Text style={styles.primaryBtnText}>{busy ? "…" : "Rotate"}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          pressHaptic();
                          setRotating(null);
                        }}
                        style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Keep the current key"
                      >
                        <Text style={styles.ghostBtnText}>Keep it</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.cardBtns}>
                    <Pressable
                      onPress={() => {
                        pressHaptic();
                        setEditing({
                          id: v.id,
                          name: v.name,
                          address: v.address ?? "",
                          timezone: v.timezone,
                          active: v.active,
                        });
                      }}
                      style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${v.name}`}
                    >
                      <Text style={styles.smallBtnText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        pressHaptic();
                        setRotating(v.id);
                      }}
                      style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`Rotate the check-in key for ${v.name}`}
                    >
                      <Text style={styles.smallBtnText}>Rotate key</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={bio.alpha(0.3)}
        style={styles.fieldInput}
        autoCapitalize="words"
        autoCorrect={false}
        selectionColor={bio.color.blue}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  flex: { flex: 1 },
  flexMin: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 20 },
  pressed: { transform: [{ scale: 0.97 }] },

  error: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.color.coralLt, marginTop: 14 },

  addBtn: {
    marginTop: 16,
    marginBottom: 20,
    paddingVertical: 13,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.blueAlpha(0.45),
    backgroundColor: bio.blueAlpha(0.12),
    alignItems: "center",
  },
  addBtnText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.blueLt },

  form: {
    marginTop: 16,
    marginBottom: 24,
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
  field: { marginBottom: 12 },
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
  fieldHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: bio.alpha(0.33),
    lineHeight: 16,
    marginTop: -4,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  switchLabel: { fontFamily: fontFamily.medium, fontSize: 15, color: bio.color.text },
  switchHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: bio.alpha(0.35),
    marginTop: 2,
    lineHeight: 16,
  },
  formBtns: { flexDirection: "row", gap: 10, marginTop: 4 },

  card: {
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.card,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    padding: 16,
    marginBottom: 12,
  },
  cardOff: { opacity: 0.6 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontFamily: fontFamily.semibold, fontSize: 16, color: bio.color.text },
  meta: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.45), marginTop: 3 },
  counts: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.33), marginTop: 8 },
  offChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.07),
  },
  offChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: bio.alpha(0.5),
  },
  cardBtns: { flexDirection: "row", gap: 8, marginTop: 14 },
  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
  },
  smallBtnText: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.7) },

  confirm: { marginTop: 14 },
  confirmTitle: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text },
  confirmBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: bio.alpha(0.5),
    marginTop: 5,
    lineHeight: 19,
  },
  confirmBtns: { flexDirection: "row", gap: 10, marginTop: 12 },

  primaryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.blueAlpha(0.22),
    borderWidth: 1,
    borderColor: bio.blueAlpha(0.5),
  },
  primaryBtnText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.blueLt },
  ghostBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
  },
  ghostBtnText: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.alpha(0.65) },
  btnOff: { opacity: 0.45 },

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
