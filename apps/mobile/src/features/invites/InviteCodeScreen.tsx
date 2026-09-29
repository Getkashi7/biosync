/**
 * Code reveal (staff, §13 1B) — the one and only time this code is visible.
 *
 * The server stores nothing but a SHA-256 hash, so there is genuinely no way
 * back to this screen. That's why the warning is stated plainly rather than
 * tucked into fine print, and why there's no "show again" affordance to build.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic, successHaptic } from "../../lib/haptics";
import { formatInviteCode } from "../../lib/format";
import { kindNoun, type CreatedInvite } from "./invitesApi";

type Props = {
  invite: CreatedInvite;
  /** the email the invite was locked to, if any — for the summary row */
  lockedTo?: string | undefined;
  onDone: () => void;
};

/** Whole hours until `at`, floored at zero. */
function hoursUntil(at: Date): number {
  return Math.max(0, Math.floor((at.getTime() - Date.now()) / 3_600_000));
}

export function InviteCodeScreen({ invite, lockedTo, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  // Depend on the raw value, not a Date built during render: a fresh object
  // every render made the effect below tear down and re-arm its interval on
  // every render, which is invisible but pointless work.
  const expiresIso = invite.expiresAt;
  const [hours, setHours] = useState(() => hoursUntil(new Date(expiresIso)));

  // The countdown is coarse (hours), so a minute tick is plenty and costs
  // nothing; it keeps the dial honest if the screen is left open.
  useEffect(() => {
    const tick = () => setHours(hoursUntil(new Date(expiresIso)));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [expiresIso]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const pretty = formatInviteCode(invite.code);

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(invite.code);
    successHaptic();
    setCopied(true);
  }, [invite.code]);

  const share = useCallback(async () => {
    pressHaptic();
    await Share.share({
      message: `Connect with me on BIOSYNC as your ${kindNoun(invite.kind)} — use code ${pretty}. It works once and expires in 72 hours.`,
    });
  }, [invite.kind, pretty]);

  // Fraction of the 72h window still to run, for the dashed dial.
  const fraction = Math.max(0, Math.min(1, hours / 72));

  return (
    <View style={styles.root}>
      <StaticBloom />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Share this code" label="Invitations" onBack={onDone} />

        <Text style={styles.lede}>
          Read it out, or send it with Share. Your client redeems it in their app.
        </Text>

        <Pressable
          onPress={() => void copy()}
          style={[styles.codeBox, copied ? styles.codeBoxCopied : styles.codeBoxIdle]}
          accessibilityRole="button"
          accessibilityLabel={`Invite code ${invite.code.split("").join(" ")}. Tap to copy.`}
        >
          <Text style={styles.code}>
            {pretty.slice(0, 4)}
            <Text style={styles.codeDash}>-</Text>
            {pretty.slice(5)}
          </Text>
          <Text style={[styles.copyHint, copied && styles.copyHintOn]}>
            {copied ? "COPIED" : "TAP TO COPY"}
          </Text>
        </Pressable>

        <View style={styles.expiryRow}>
          <View style={styles.dial}>
            <Svg width={bio.invite.ring} height={bio.invite.ring}>
              <Circle
                cx={bio.invite.ring / 2}
                cy={bio.invite.ring / 2}
                r={bio.invite.ringRadius}
                fill="none"
                stroke={bio.alpha(0.1)}
                strokeWidth={bio.invite.ringStroke}
                strokeDasharray={bio.invite.ringDash}
                strokeLinecap="round"
              />
              <Circle
                cx={bio.invite.ring / 2}
                cy={bio.invite.ring / 2}
                r={bio.invite.ringRadius}
                fill="none"
                stroke={bio.tealAlpha(0.85)}
                strokeWidth={bio.invite.ringStroke}
                strokeDasharray={`${2 * Math.PI * bio.invite.ringRadius * fraction} ${2 * Math.PI * bio.invite.ringRadius}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${bio.invite.ring / 2} ${bio.invite.ring / 2})`}
              />
            </Svg>
            <View style={styles.dialCentre}>
              <Text style={styles.dialText}>{hours}h</Text>
            </View>
          </View>
          <View style={styles.flex}>
            <Text style={styles.expiryTitle}>Expires in {hours} hours</Text>
            <Text style={styles.expiryBody}>
              Works once, then it's gone. You can revoke it any time.
            </Text>
          </View>
        </View>

        <View style={styles.facts}>
          <Fact label="Capacity" value={invite.kind === "PT" ? "As PT" : "As Biomeds"} />
          <Fact label="Who can use it" value={lockedTo ?? "Anyone with the code"} />
          <Fact label="On accept" value="They see nothing until they share" />
        </View>

        <View style={styles.warnRow}>
          <View style={styles.warnDot} />
          <Text style={styles.warnText}>You won't be able to see this code again.</Text>
        </View>

        <View style={styles.spacer} />

        <Pressable onPress={() => void share()} accessibilityRole="button" accessibilityLabel="Share code">
          <LinearGradient
            colors={[bio.color.teal, bio.color.tealDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>Share</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={() => {
            pressHaptic();
            onDone();
          }}
          style={styles.secondary}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.secondaryText}>Done</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, flexGrow: 1 },

  lede: { fontFamily: fontFamily.light, fontSize: 12.5, lineHeight: 19.4, color: bio.alpha(0.6), marginTop: 12 },

  codeBox: {
    marginTop: 24,
    borderRadius: bio.invite.codeBoxRadius,
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
  },
  codeBoxIdle: { backgroundColor: bio.color.glassLo, borderColor: bio.color.border2 },
  codeBoxCopied: { backgroundColor: bio.tealAlpha(0.07), borderColor: bio.tealAlpha(0.5) },
  code: { ...bio.invite.code, color: bio.color.text },
  codeDash: { color: bio.alpha(0.35) },
  copyHint: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
    letterSpacing: 0.69,
    color: bio.alpha(0.45),
    marginTop: 14,
  },
  copyHintOn: { color: bio.color.teal },

  expiryRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 24, paddingHorizontal: 4 },
  dial: { width: bio.invite.ring, height: bio.invite.ring },
  dialCentre: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  dialText: { fontFamily: fontFamily.dot, fontSize: 14, color: bio.color.teal },
  expiryTitle: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: bio.color.text },
  expiryBody: { fontFamily: fontFamily.light, fontSize: 11.5, color: bio.alpha(0.5), marginTop: 3 },

  facts: { marginTop: 22, borderTopWidth: 1, borderTopColor: bio.alpha(0.08) },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: bio.alpha(0.06),
  },
  factLabel: { fontFamily: fontFamily.regular, fontSize: 12.5, color: bio.alpha(0.6) },
  factValue: { flexShrink: 1, fontFamily: fontFamily.semibold, fontSize: 12.5, color: bio.alpha(0.75), textAlign: "right" },

  warnRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18, paddingHorizontal: 4 },
  warnDot: { width: bio.invite.dot, height: bio.invite.dot, borderRadius: bio.invite.dot, backgroundColor: bio.color.teal },
  warnText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 12.5, color: bio.alpha(0.75) },

  spacer: { flex: 1, minHeight: 24 },
  cta: {
    height: bio.invite.ctaStaff.height,
    borderRadius: bio.invite.ctaStaff.radius,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 14.5, color: bio.color.onTeal },
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
