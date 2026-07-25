/**
 * New invitation (staff, §13 1A).
 *
 * Restrained register, matching the trainer bundle: one teal accent, a single
 * static aurora bloom, flat hairline rows. Depth from hairlines and type, not
 * light.
 *
 * The capacity segmented control only appears when the account actually holds
 * both capacities — otherwise it's a static row, because a control with one
 * option is a control that can't be used.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { createInvite, type CreatedInvite, type StaffKind } from "./invitesApi";

type Props = {
  /** the capacities this account actually holds */
  capabilities: StaffKind[];
  onBack: () => void;
  onCreated: (invite: CreatedInvite) => void;
};

const CAP_LABEL: Record<StaffKind, string> = { PT: "As trainer", PRACTITIONER: "As practitioner" };

export function InviteCreateScreen({ capabilities, onBack, onCreated }: Props) {
  const insets = useSafeAreaInsets();
  const both = capabilities.length > 1;
  const [kind, setKind] = useState<StaffKind>(capabilities[0] ?? "PT");
  const [lock, setLock] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knob = useSharedValue(0);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value }] }));

  const toggleLock = () => {
    pressHaptic();
    const next = !lock;
    setLock(next);
    knob.value = withTiming(next ? bio.invite.knobTravel : 0, { duration: 200 });
    if (!next) setEmail("");
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = email.trim();
      onCreated(await createInvite(kind, lock && trimmed ? trimmed : undefined));
    } catch {
      setError("Couldn't create the invitation. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // An email lock with an empty field would silently create an open invite.
  const ready = !busy && (!lock || email.trim().length > 0);

  return (
    <View style={styles.root}>
      <StaticBloom />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="New invitation" label="Trainer · Invitations" onBack={onBack} />

          <Text style={styles.lede}>
            Connecting a client shares nothing — they choose what you see, after they accept.
          </Text>

          <Text style={styles.section}>INVITE AS</Text>
          {both ? (
            <View style={styles.segRow}>
              {capabilities.map((c) => {
                const on = c === kind;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      pressHaptic();
                      setKind(c);
                    }}
                    style={[styles.seg, on ? styles.segOn : styles.segOff]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={CAP_LABEL[c]}
                  >
                    <Text style={[styles.segText, on && styles.segTextOn]}>{CAP_LABEL[c]}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.onlyCap}>
              <View style={styles.capDot} />
              <Text style={styles.onlyCapText}>{CAP_LABEL[kind]}</Text>
              <Text style={styles.onlyCapHint}>your only capacity</Text>
            </View>
          )}

          <Text style={styles.section}>WHO CAN USE IT</Text>
          <View style={styles.lockCard}>
            <Pressable
              style={styles.lockRow}
              onPress={toggleLock}
              accessibilityRole="switch"
              accessibilityState={{ checked: lock }}
              accessibilityLabel="Lock to an email address"
            >
              <View style={styles.flex}>
                <Text style={styles.lockTitle}>Lock to an email address</Text>
                <Text style={styles.lockHint}>
                  {lock ? "Only one account will be able to use it" : "Off — anyone with the code can use it"}
                </Text>
              </View>
              {lock ? (
                <LinearGradient
                  colors={[bio.color.teal, bio.color.tealDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.track}
                >
                  <Animated.View style={[styles.knob, knobStyle]} />
                </LinearGradient>
              ) : (
                <View style={[styles.track, styles.trackOff]}>
                  <Animated.View style={[styles.knob, knobStyle]} />
                </View>
              )}
            </Pressable>

            {lock ? (
              <View style={styles.lockField}>
                <View style={styles.input}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="client@email.com"
                    placeholderTextColor={bio.alpha(0.38)}
                    style={styles.inputText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    selectionColor={bio.color.teal}
                    accessibilityLabel="Client email address"
                  />
                </View>
                <Text style={styles.lockNote}>Only that account can use the code.</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.facts}>
            <Fact label="Works" value="1×" dot />
            <Fact label="Expires after" value="72h" dot />
            <Fact label="Shown" value="Once, at creation" />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.spacer} />

          <Pressable
            onPress={() => void submit()}
            disabled={!ready}
            style={!ready ? styles.ctaDisabled : undefined}
            accessibilityRole="button"
            accessibilityLabel="Create invite"
          >
            <LinearGradient
              colors={[bio.color.teal, bio.color.tealDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>{busy ? "Creating…" : "Create invite"}</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** One hairline fact row. `dot` renders the value in the Doto readout face. */
function Fact({ label, value, dot }: { label: string; value: string; dot?: boolean }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={dot ? styles.factValueDot : styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, flexGrow: 1 },

  lede: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 19.4,
    color: bio.alpha(0.6),
    marginTop: 14,
  },
  section: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.76,
    color: bio.alpha(0.45),
    marginTop: 26,
    paddingHorizontal: 2,
  },

  segRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  seg: { flex: 1, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  segOn: { backgroundColor: bio.tealAlpha(0.14), borderColor: bio.tealAlpha(0.45) },
  segOff: { backgroundColor: bio.color.glassLo, borderColor: bio.alpha(0.1) },
  segText: { fontFamily: fontFamily.bold, fontSize: 13, color: bio.alpha(0.55) },
  segTextOn: { color: bio.color.teal },

  onlyCap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    backgroundColor: bio.color.glassLo,
  },
  capDot: { width: bio.invite.dot, height: bio.invite.dot, borderRadius: bio.invite.dot, backgroundColor: bio.color.teal },
  onlyCapText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.text },
  onlyCapHint: { fontFamily: fontFamily.light, fontSize: 11, color: bio.alpha(0.4), marginLeft: "auto" },

  lockCard: {
    marginTop: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: bio.alpha(0.1),
    backgroundColor: bio.color.glassLo,
  },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  lockTitle: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.text },
  lockHint: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.5), marginTop: 3 },
  track: {
    width: bio.invite.track.width,
    height: bio.invite.track.height,
    borderRadius: bio.invite.track.radius,
    padding: bio.invite.track.pad,
    justifyContent: "center",
  },
  trackOff: { backgroundColor: bio.alpha(0.12) },
  knob: { width: bio.invite.knob, height: bio.invite.knob, borderRadius: bio.invite.knob, backgroundColor: bio.color.knob },

  lockField: { paddingHorizontal: 14, paddingBottom: 14 },
  input: {
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.color.border2,
  },
  inputText: { fontFamily: fontFamily.regular, fontSize: 14, color: bio.color.text, padding: 0 },
  lockNote: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.5), marginTop: 8, paddingHorizontal: 2 },

  facts: { marginTop: 28, borderTopWidth: 1, borderTopColor: bio.alpha(0.08) },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.06),
  },
  factLabel: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.alpha(0.6) },
  factValue: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.alpha(0.75) },
  factValueDot: { fontFamily: fontFamily.dot, fontSize: 15, color: bio.alpha(0.75) },

  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: bio.color.coralLt,
    marginTop: 16,
    paddingHorizontal: 2,
  },

  spacer: { flex: 1, minHeight: 24 },
  cta: {
    height: bio.invite.ctaStaff.height,
    borderRadius: bio.invite.ctaStaff.radius,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 14.5, color: bio.color.onTeal },
});
