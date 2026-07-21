/**
 * Ask — the BIOSYNC AI Coach. A conversational wellness guide grounded in the
 * user's own data (readiness, sleep, energy, recent metrics), served by
 * `assistant.chat` (Groq, non-diagnostic). Three states from the design:
 *  · morning digest (5C) — proactive number-forward cards from real data, each
 *    with an "Ask about this" handoff into the thread;
 *  · first run (5A) — a breathing presence orb, starter prompts;
 *  · live thread (5B) — user/assistant bubbles, a typing indicator, follow-ups.
 * Full-bleed aurora; the composer sits above the floating tab bar (hidden while
 * the keyboard is up — MainTabs handles that). No health values are logged.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { dateLabel } from "../../lib/format";
import { PresenceOrb } from "./PresenceOrb";
import { sendChat, type ChatMessage } from "./coachApi";
import { fetchDigest, type Digest, type DigestCard } from "./digestApi";

/** First-run starter prompts (design 5A). */
const STARTERS = [
  "Why is my readiness low today?",
  "How did I sleep this week?",
  "What's driving my glucose spikes?",
  "Plan me an easy training day",
] as const;

/** In-thread follow-up pills (design 5B). */
const PILLS = ["Break it down for me", "What should I do today?", "How did I sleep?"] as const;

const ERR_REPLY = "I hit a snag reaching my brain just now. Give it a moment and try again.";

/** metric-family hue + glow rgb per digest card (design 5C). */
const FAM: Record<DigestCard["family"], { hue: string; rgb: string }> = {
  sleep: { hue: bio.color.violet, rgb: bio.aurora.violet },
  hrv: { hue: bio.color.blue, rgb: bio.aurora.blue },
  glucose: { hue: bio.color.amber, rgb: bio.aurora.amber },
  restingHr: { hue: bio.color.coral, rgb: bio.aurora.coral },
  readiness: { hue: bio.color.tealLt, rgb: bio.aurora.teal },
};

export function CoachScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [kbVisible, setKbVisible] = useState(false);
  const [digest, setDigest] = useState<Digest | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const hasThread = messages.length > 0;
  const showDigest = !hasThread && digest !== null && digest.cards.length > 0;
  const mode: "thread" | "digest" | "firstRun" = hasThread ? "thread" : showDigest ? "digest" : "firstRun";

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return;
      pressHaptic();
      Keyboard.dismiss();
      const next: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      setInput("");
      setSending(true);
      try {
        const { reply } = await sendChat(next);
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: ERR_REPLY }]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending],
  );

  // Load today's proactive digest once; failure just falls back to first-run.
  useEffect(() => {
    let alive = true;
    fetchDigest()
      .then((d) => alive && setDigest(d))
      .catch(() => alive && setDigest({ greeting: "", cards: [] }));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKbVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKbVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Keep the newest message in view as the thread grows / the coach thinks.
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [messages, sending]);

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.teal, size: 480, cx: true, top: -60, stops: [{ o: 0, a: 0.34 }, { o: 46, a: 0.12 }, { o: 72, a: 0 }], variant: "a" },
          { hue: bio.aurora.blue, size: 300, left: -120, bottom: 60, stops: [{ o: 0, a: 0.16 }, { o: 70, a: 0 }], variant: "b", delayMs: -5000 },
        ]}
      />

      <View style={[styles.inner, { paddingTop: insets.top + 12, paddingBottom: kbVisible ? 12 : insets.bottom + 96 }]}>
        {mode !== "firstRun" ? (
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Ask</Text>
              <View style={styles.syncedBadge}>
                <View style={styles.syncedDot} />
                <Text style={styles.syncedText}>SYNCED</Text>
              </View>
            </View>
            <Text style={styles.headerNote}>{mode === "digest" ? dateLabel() : "reads your last 30 days"}</Text>
          </View>
        ) : null}

        {mode === "thread" ? (
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.thread}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.content} />
            ))}
            {sending ? <TypingDots /> : null}
          </ScrollView>
        ) : mode === "digest" ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.digest}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {digest!.greeting ? (
              <View style={styles.rowTheirs}>
                <View style={[styles.bubble, styles.bubbleTheirs]}>
                  <Text style={styles.bubbleText}>{digest!.greeting}</Text>
                </View>
              </View>
            ) : null}
            {digest!.cards.map((c) => (
              <DigestCardView key={c.id} card={c} onAsk={() => void send(c.ask)} />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.firstRun}>
            <PresenceOrb />
            <Text style={styles.orbTitle}>Ask me about your body</Text>
            <Text style={styles.orbSub}>I read your last 30 days — sleep, heart, glucose — before I answer.</Text>
          </View>
        )}

        {mode === "thread" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.pillRow}
          >
            {PILLS.map((p) => (
              <Pressable key={p} onPress={() => void send(p)} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
                <Text style={styles.pillText}>{p}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : mode === "firstRun" ? (
          <View style={styles.starters}>
            {STARTERS.map((s) => (
              <Pressable key={s} onPress={() => void send(s)} style={({ pressed }) => [styles.starterRow, pressed && styles.pressed]}>
                <Text style={styles.starterText}>{s}</Text>
                <Svg width={9} height={9} viewBox="0 0 9 9" fill="none">
                  <Path d="M2 1 L6 4.5 L2 8" stroke={bio.color.teal} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.disclaimer}>
          <View style={styles.disclaimerDot} />
          <Text style={styles.disclaimerText}>Wellness guidance — not medical advice</Text>
        </View>

        <View style={styles.composer}>
          <View style={styles.field}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything…"
              placeholderTextColor={bio.alpha(0.4)}
              style={styles.input}
              returnKeyType="send"
              onSubmitEditing={() => void send(input)}
              blurOnSubmit={false}
              editable={!sending}
            />
          </View>
          <Pressable
            onPress={() => void send(input)}
            disabled={sending || !input.trim()}
            style={({ pressed }) => [pressed && styles.pressed, (sending || !input.trim()) && styles.sendIdle]}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <LinearGradient colors={[bio.color.tealLt, bio.color.teal]} start={{ x: 0.3, y: 0.2 }} end={{ x: 1, y: 1 }} style={styles.send}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M12 20 V5 M6 11 L12 5 L18 11" stroke={bio.color.onTeal} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function DigestCardView({ card, onAsk }: { card: DigestCard; onAsk: () => void }) {
  const fam = FAM[card.family];
  return (
    <View style={styles.card}>
      <View style={[styles.bloom, { backgroundColor: fam.hue }]} />
      <View style={styles.cardHead}>
        <View style={styles.cardFam}>
          <View style={[styles.famDot, { backgroundColor: fam.hue, shadowColor: fam.hue }]} />
          <Text style={[styles.famLabel, { color: fam.hue }]}>{card.label.toUpperCase()}</Text>
        </View>
        <View style={styles.confRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.confDot, i < card.confidence ? styles.confOn : styles.confOff]} />
          ))}
        </View>
      </View>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { textShadowColor: `rgba(${fam.rgb},0.5)` }]}>{card.value}</Text>
        <Text style={styles.unit}>{card.unit}</Text>
      </View>
      <Text style={styles.reading}>{card.reading}</Text>
      <Pressable onPress={onAsk} style={({ pressed }) => [styles.askRow, pressed && styles.pressed]}>
        <Text style={styles.askText}>Ask about this</Text>
        <Svg width={8} height={8} viewBox="0 0 9 9" fill="none">
          <Path d="M2 1 L6 4.5 L2 8" stroke={bio.color.tealLt} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
    </View>
  );
}

function Bubble({ role, text }: { role: ChatMessage["role"]; text: string }) {
  const mine = role === "user";
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={styles.bubbleText}>{text}</Text>
      </View>
    </View>
  );
}

function TypingDots() {
  return (
    <View style={styles.rowTheirs}>
      <View style={styles.typing}>
        <PulseDot delay={0} />
        <PulseDot delay={400} />
        <PulseDot delay={800} />
      </View>
    </View>
  );
}

function PulseDot({ delay }: { delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [v, delay]);
  const style = useAnimatedStyle(() => ({ opacity: interpolate(v.value, [0, 1], [0.3, 1]) }));
  return <Animated.View style={[styles.typingDot, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  flex: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20 },

  // header (thread + digest)
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.24, color: bio.color.text },
  syncedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.tealAlpha(0.1),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.3),
  },
  syncedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: bio.color.teal,
    shadowColor: bio.color.teal,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  syncedText: { fontFamily: fontFamily.bold, fontSize: 10.5, letterSpacing: 0.9, color: bio.color.tealLt },
  headerNote: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.4) },

  // thread
  thread: { flexGrow: 1, justifyContent: "flex-end", gap: 12, paddingVertical: 8 },
  bubbleRow: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "84%", paddingVertical: 12, paddingHorizontal: 15 },
  bubbleMine: {
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border2,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 8,
  },
  bubbleTheirs: {
    backgroundColor: bio.tealAlpha(0.1),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.26),
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 22,
  },
  bubbleText: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, color: bio.color.text },

  // typing indicator
  typing: {
    flexDirection: "row",
    gap: 5,
    paddingVertical: 17,
    paddingHorizontal: 18,
    backgroundColor: bio.tealAlpha(0.1),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.26),
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 22,
  },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: bio.color.tealLt },

  // digest
  digest: { flexGrow: 1, gap: 12, paddingVertical: 8 },
  card: {
    borderRadius: bio.radius.card,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.color.border2,
    padding: 18,
    overflow: "hidden",
  },
  bloom: { position: "absolute", width: 170, height: 170, right: -60, top: -60, borderRadius: 85, opacity: 0.12 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardFam: { flexDirection: "row", alignItems: "center", gap: 8 },
  famDot: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  famLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, letterSpacing: 1.2 },
  confRow: { flexDirection: "row", gap: 4 },
  confDot: { width: 5, height: 5, borderRadius: 2.5 },
  confOn: { backgroundColor: bio.alpha(0.9) },
  confOff: { borderWidth: 1, borderColor: bio.alpha(0.35) },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 12 },
  value: {
    fontFamily: fontFamily.dot,
    fontSize: 32,
    letterSpacing: 2,
    color: bio.color.text,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  unit: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.5) },
  reading: { fontFamily: fontFamily.light, fontSize: 13, lineHeight: 20, color: bio.alpha(0.65), marginTop: 8 },
  askRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, alignSelf: "flex-start" },
  askText: { fontFamily: fontFamily.bold, fontSize: 12, color: bio.color.tealLt },

  // follow-up pills
  pillRow: { gap: 8, paddingVertical: 4, paddingHorizontal: 4 },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.tealAlpha(0.08),
    borderWidth: 1,
    borderColor: bio.tealAlpha(0.3),
  },
  pillText: { fontFamily: fontFamily.semibold, fontSize: 12, color: bio.color.tealLt },

  // first run
  firstRun: { flex: 1, alignItems: "center", justifyContent: "center" },
  orbTitle: { fontFamily: fontFamily.bold, fontSize: 23, letterSpacing: -0.23, color: bio.color.text, marginTop: 24 },
  orbSub: {
    fontFamily: fontFamily.light,
    fontSize: 13.5,
    lineHeight: 21,
    color: bio.alpha(0.55),
    textAlign: "center",
    maxWidth: 270,
    marginTop: 8,
  },
  starters: { gap: 10 },
  starterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: bio.alpha(0.05),
    borderWidth: 1,
    borderColor: bio.color.border2,
  },
  starterText: { fontFamily: fontFamily.medium, fontSize: 13.5, color: bio.alpha(0.85) },

  // disclaimer chip
  disclaimer: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.04),
    borderWidth: 1,
    borderColor: bio.color.hairline,
    marginTop: 14,
    marginBottom: 10,
  },
  disclaimerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: bio.color.teal,
    shadowColor: bio.color.teal,
    shadowOpacity: 0.8,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  disclaimerText: { fontFamily: fontFamily.medium, fontSize: 10.5, letterSpacing: 0.2, color: bio.alpha(0.5) },

  // composer
  composer: { flexDirection: "row", alignItems: "center", gap: 10 },
  field: {
    flex: 1,
    height: 52,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.color.glassHi2,
    borderWidth: 1,
    borderColor: bio.color.border,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  input: { flex: 1, fontFamily: fontFamily.regular, fontSize: 14, color: bio.color.text, padding: 0 },
  send: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  sendIdle: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
