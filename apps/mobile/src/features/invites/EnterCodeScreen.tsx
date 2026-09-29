/**
 * Enter a code → confirm → connected (client, §13 3A/4A/4B/5A–5D).
 *
 * One flow, four steps, because they're a single decision from the user's side.
 * Standard consumer register: glass, breathing violet aurora.
 *
 * The honest explainer on the confirm step is the point of this screen.
 * Connecting shares nothing — the server creates the link and no consent — so
 * the UI says exactly that before the client commits, rather than after.
 */
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, pressHaptic, successHaptic } from "../../lib/haptics";
import { formatInviteCode, initials, normaliseInviteCode, INVITE_CODE_LENGTH } from "../../lib/format";
import {
  acceptInvite,
  classifyFailure,
  kindNoun,
  previewInvite,
  type CodeFailure,
  type InvitePreview,
} from "./invitesApi";

type Props = {
  onBack: () => void;
  /** open the consent centre — the natural next step after connecting */
  onOpenConsent: () => void;
  /** connection succeeded, so the care team should refetch */
  onConnected: () => void;
};

type Step =
  | { kind: "entry" }
  | { kind: "confirm"; preview: InvitePreview }
  | { kind: "connected"; name: string; capacity: string }
  | { kind: "error"; failure: CodeFailure; code: string };

const ERROR_COPY: Record<CodeFailure, { title: string; body: string; cta: string }> = {
  invalid: {
    title: "That code isn't valid",
    body: "Check it against the code you were given — 8 letters and numbers, in two groups of four.",
    cta: "Try again",
  },
  expired: {
    title: "That code has expired",
    body: "Codes work for 72 hours after they're created. Ask them to make you a new one.",
    cta: "Enter a new code",
  },
  used: {
    title: "That code has already been used",
    body: "Each code connects one account, once. If this wasn't you, ask them to make a new one.",
    cta: "Enter a new code",
  },
  account: {
    title: "This invitation is for a different account",
    body: "It's locked to a specific email address — not the one you're signed in with. Ask them for a code for this account.",
    cta: "Enter a new code",
  },
};

const BLOBS = [
  {
    hue: bio.aurora.violet,
    size: 460,
    cx: true,
    top: -70,
    stops: [
      { o: 0, a: 0.32 },
      { o: 46, a: 0.1 },
      { o: 72, a: 0 },
    ],
    variant: "a" as const,
  },
  {
    hue: bio.aurora.blue,
    size: 300,
    right: -120,
    bottom: 150,
    stops: [
      { o: 0, a: 0.12 },
      { o: 70, a: 0 },
    ],
    variant: "b" as const,
    delayMs: -5000,
  },
];

export function EnterCodeScreen({ onBack, onOpenConsent, onConnected }: Props) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>({ kind: "entry" });
  const [busy, setBusy] = useState(false);

  const valid = code.length === INVITE_CODE_LENGTH;

  const check = useCallback(async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const preview = await previewInvite(code);
      if (preview.state !== "active") {
        errorHaptic();
        setStep({
          kind: "error",
          failure: preview.state === "expired" ? "expired" : "used",
          code,
        });
      } else if (preview.wrongAccount) {
        errorHaptic();
        setStep({ kind: "error", failure: "account", code });
      } else if (preview.isSelf) {
        errorHaptic();
        setStep({ kind: "error", failure: "invalid", code });
      } else {
        pressHaptic();
        setStep({ kind: "confirm", preview });
      }
    } catch (err) {
      errorHaptic();
      setStep({ kind: "error", failure: classifyFailure(err), code });
    } finally {
      setBusy(false);
    }
  }, [busy, code, valid]);

  const connect = useCallback(async () => {
    if (step.kind !== "confirm" || busy) return;
    setBusy(true);
    try {
      await acceptInvite(code);
      successHaptic();
      onConnected();
      setStep({
        kind: "connected",
        name: step.preview.from,
        capacity: kindNoun(step.preview.kind),
      });
    } catch (err) {
      errorHaptic();
      setStep({ kind: "error", failure: classifyFailure(err), code });
    } finally {
      setBusy(false);
    }
  }, [busy, code, onConnected, step]);

  const retry = () => {
    pressHaptic();
    setCode("");
    setStep({ kind: "entry" });
  };

  return (
    <View style={styles.root}>
      <AuroraField blobs={BLOBS} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step.kind === "connected" ? null : (
            <ScreenHeader
              title={step.kind === "confirm" ? "Confirm" : "Enter a code"}
              label="Care team"
              onBack={step.kind === "entry" ? onBack : retry}
            />
          )}

          {step.kind === "entry" ? (
            <>
              <Text style={styles.lede}>
                Your PT or Biomeds gives you an 8-character code. It connects your
                accounts — nothing more.
              </Text>

              <View style={styles.inputCard}>
                <TextInput
                  value={formatInviteCode(code)}
                  onChangeText={(t) => setCode(normaliseInviteCode(t))}
                  placeholder="····-····"
                  placeholderTextColor={bio.alpha(0.25)}
                  style={styles.codeInput}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  spellCheck={false}
                  selectionColor={bio.color.violet}
                  accessibilityLabel="Invite code"
                />
                <View style={styles.inputMeta}>
                  <Text style={styles.helper}>
                    {valid ? "Looks right" : "Letters and numbers only"}
                  </Text>
                  <Text style={[styles.counter, valid && styles.counterOn]}>
                    {code.length}/{INVITE_CODE_LENGTH}
                  </Text>
                </View>
              </View>

              <Text style={styles.hint}>
                Paste works too — dashes and lower case don't matter. Codes never contain O, I, L,
                S, B, Z, 0, 1, 2, 5 or 8.
              </Text>

              <View style={styles.spacer} />

              <Pressable
                onPress={() => void check()}
                disabled={!valid || busy}
                accessibilityRole="button"
                accessibilityLabel="Continue"
                accessibilityState={{ disabled: !valid || busy }}
              >
                {valid ? (
                  <LinearGradient
                    colors={[bio.color.violet, bio.color.violetDeep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cta}
                  >
                    <Text style={styles.ctaText}>{busy ? "Checking…" : "Continue"}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.cta, styles.ctaOff]}>
                    <Text style={styles.ctaOffText}>Continue</Text>
                  </View>
                )}
              </Pressable>
            </>
          ) : step.kind === "confirm" ? (
            <>
              <View style={styles.hero}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(step.preview.from)}</Text>
                </View>
                <Text style={styles.heroName}>{step.preview.from}</Text>
                <Text style={styles.heroSub}>
                  wants to connect as your {kindNoun(step.preview.kind)}
                </Text>
              </View>

              <View style={styles.explainer}>
                <Bullet text="They'll appear in your care team." />
                <Bullet text="Connecting shares none of your data — they see nothing today." bold="none" />
                <Bullet text="You choose what to share afterwards, in Who sees what." />
                <Bullet text="You can disconnect at any time." last />
              </View>

              <View style={styles.spacer} />

              <Pressable
                onPress={() => void connect()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Connect"
                accessibilityState={{ disabled: busy }}
              >
                <LinearGradient
                  colors={[bio.color.violet, bio.color.violetDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cta}
                >
                  <Text style={styles.ctaText}>{busy ? "Connecting…" : "Connect"}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={retry}
                style={styles.secondary}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </>
          ) : step.kind === "connected" ? (
            <View style={styles.connectedWrap}>
              <View style={styles.connectedHero}>
                <View style={styles.avatarLg}>
                  <Text style={styles.avatarLgText}>{initials(step.name)}</Text>
                </View>
                <View style={styles.tick}>
                  <Text style={styles.tickMark}>✓</Text>
                </View>
              </View>
              <Text style={styles.connectedTitle}>Connected</Text>
              <Text style={styles.connectedBody}>
                {step.name} is now your {step.capacity}. They can't see anything yet — what you
                share is up to you.
              </Text>

              <View style={styles.nextCard}>
                <Text style={styles.nextLabel}>NEXT</Text>
                <Text style={styles.nextBody}>
                  Choose what to share in <Text style={styles.nextBold}>Who sees what</Text>. Until
                  then, everything stays private.
                </Text>
                <Pressable
                  onPress={() => {
                    pressHaptic();
                    onOpenConsent();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open Who sees what"
                >
                  <LinearGradient
                    colors={[bio.color.violet, bio.color.violetDeep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.nextCta}
                  >
                    <Text style={styles.nextCtaText}>Open Who sees what</Text>
                  </LinearGradient>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  pressHaptic();
                  onBack();
                }}
                accessibilityRole="button"
                accessibilityLabel="Not now"
              >
                <Text style={styles.notNow}>Not now</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.errorWrap}>
              <View style={styles.errorRing}>
                <View style={styles.errorDot} />
              </View>
              <Text style={styles.errorCode}>{formatInviteCode(step.code)}</Text>
              <Text style={styles.errorTitle}>{ERROR_COPY[step.failure].title}</Text>
              <Text style={styles.errorBody}>{ERROR_COPY[step.failure].body}</Text>
              <View style={styles.spacer} />
              <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel={ERROR_COPY[step.failure].cta}>
                <LinearGradient
                  colors={[bio.color.violet, bio.color.violetDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cta}
                >
                  <Text style={styles.ctaText}>{ERROR_COPY[step.failure].cta}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** One row of the honest explainer. `bold` emphasises a single word inline. */
function Bullet({ text, bold, last }: { text: string; bold?: string; last?: boolean }) {
  const parts = bold ? text.split(bold) : null;
  return (
    <View style={[styles.bulletRow, last && styles.bulletRowLast]}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>
        {parts && parts.length === 2 ? (
          <>
            {parts[0]}
            <Text style={styles.bulletStrong}>{bold}</Text>
            {parts[1]}
          </>
        ) : (
          text
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 22, flexGrow: 1 },

  lede: { fontFamily: fontFamily.light, fontSize: 12.5, lineHeight: 18.75, color: bio.alpha(0.62), marginTop: 14 },

  inputCard: {
    marginTop: 26,
    borderRadius: 20,
    backgroundColor: bio.color.glassHi,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingTop: 24,
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  codeInput: {
    ...bio.invite.codeInput,
    color: bio.color.text,
    textAlign: "center",
    padding: 0,
  },
  inputMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: bio.alpha(0.08),
  },
  helper: { fontFamily: fontFamily.light, fontSize: 11, color: bio.alpha(0.45) },
  counter: { fontFamily: fontFamily.dotBold, fontSize: 13, color: bio.alpha(0.4) },
  counterOn: { color: bio.color.violet },
  hint: {
    fontFamily: fontFamily.light,
    fontSize: 11.5,
    lineHeight: 17.25,
    color: bio.alpha(0.45),
    marginTop: 12,
    paddingHorizontal: 4,
  },

  hero: { alignItems: "center", marginTop: 44 },
  avatar: {
    width: bio.invite.avatarConfirm,
    height: bio.invite.avatarConfirm,
    borderRadius: bio.invite.avatarConfirm / 2,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fontFamily.semibold, fontSize: 21, color: bio.alpha(0.85) },
  heroName: { fontFamily: fontFamily.bold, fontSize: 22, letterSpacing: -0.22, color: bio.color.text, marginTop: 16 },
  heroSub: { fontFamily: fontFamily.light, fontSize: 14, color: bio.alpha(0.6), marginTop: 5 },

  explainer: {
    marginTop: 32,
    borderRadius: 20,
    backgroundColor: bio.color.glassHi,
    borderWidth: 1,
    borderColor: bio.color.border2,
    paddingHorizontal: 16,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.07),
  },
  bulletRowLast: { borderBottomWidth: 0 },
  bulletDot: {
    width: bio.invite.bullet,
    height: bio.invite.bullet,
    borderRadius: bio.invite.bullet,
    backgroundColor: bio.color.violet,
    marginTop: 6,
  },
  bulletText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19.5, color: bio.alpha(0.8) },
  bulletStrong: { fontFamily: fontFamily.bold, color: bio.color.text },

  connectedWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  connectedHero: { width: bio.invite.avatarConnected, height: bio.invite.avatarConnected },
  avatarLg: {
    width: bio.invite.avatarConnected,
    height: bio.invite.avatarConnected,
    borderRadius: bio.invite.avatarConnected / 2,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLgText: { fontFamily: fontFamily.semibold, fontSize: 23, color: bio.alpha(0.85) },
  tick: {
    position: "absolute",
    right: -4,
    bottom: -2,
    width: bio.invite.tickBadge,
    height: bio.invite.tickBadge,
    borderRadius: bio.invite.tickBadge / 2,
    backgroundColor: bio.color.violet,
    borderWidth: 3,
    borderColor: bio.color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  tickMark: { fontFamily: fontFamily.bold, fontSize: 12, color: bio.color.onViolet },
  connectedTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.36,
    color: bio.color.text,
    marginTop: 22,
  },
  connectedBody: {
    fontFamily: fontFamily.light,
    fontSize: 14,
    lineHeight: 21.7,
    color: bio.alpha(0.65),
    textAlign: "center",
    marginTop: 8,
  },
  nextCard: {
    width: "100%",
    marginTop: 34,
    borderRadius: 20,
    backgroundColor: bio.color.glassHi,
    borderWidth: 1,
    borderColor: bio.color.border2,
    padding: 18,
  },
  nextLabel: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 1.68, color: bio.alpha(0.45) },
  nextBody: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 20.25, color: bio.alpha(0.8), marginTop: 8 },
  nextBold: { fontFamily: fontFamily.bold, color: bio.color.text },
  nextCta: { height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 14 },
  nextCtaText: { fontFamily: fontFamily.bold, fontSize: 14, color: bio.color.onViolet },
  notNow: { fontFamily: fontFamily.semibold, fontSize: 13, color: bio.alpha(0.55), marginTop: 18 },

  errorWrap: { flex: 1, alignItems: "center", paddingTop: 60 },
  errorRing: {
    width: bio.invite.errorRing,
    height: bio.invite.errorRing,
    borderRadius: bio.invite.errorRing / 2,
    borderWidth: 1.5,
    borderColor: bio.coralAlpha(0.45),
    alignItems: "center",
    justifyContent: "center",
  },
  errorDot: {
    width: bio.invite.errorDot,
    height: bio.invite.errorDot,
    borderRadius: bio.invite.errorDot,
    backgroundColor: bio.color.coral,
  },
  errorCode: { ...bio.invite.codeEcho, color: bio.alpha(0.4), marginTop: 26 },
  errorTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 21,
    letterSpacing: -0.21,
    color: bio.color.text,
    marginTop: 12,
    textAlign: "center",
  },
  errorBody: {
    fontFamily: fontFamily.light,
    fontSize: 13.5,
    lineHeight: 20.9,
    color: bio.alpha(0.6),
    textAlign: "center",
    marginTop: 10,
  },

  spacer: { flex: 1, minHeight: 28 },
  cta: {
    height: bio.invite.ctaClient.height,
    borderRadius: bio.invite.ctaClient.radius,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaOff: { backgroundColor: bio.alpha(0.05), borderWidth: 1, borderColor: bio.alpha(0.08) },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 15, color: bio.color.onViolet },
  ctaOffText: { fontFamily: fontFamily.bold, fontSize: 15, color: bio.alpha(0.35) },
  secondary: {
    height: bio.invite.ctaSecondary.height,
    borderRadius: bio.invite.ctaSecondary.radius,
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryText: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.alpha(0.8) },
});
