/**
 * Trends (§10) — four series, and one deliberate absence.
 *
 * **There is no revenue sparkline, and there must not be one.** Stripe reports
 * subscriptions as they are now, not as they were six weeks ago. A line drawn
 * back through August from a present-tense snapshot would be invented — and it
 * would be the one fabricated number on a screen somebody makes a business
 * decision from. MRR appears here as a single current figure, with the date it
 * was fetched, and nothing more.
 *
 * **`approximate` is shown, not swallowed.** Past the server's row cap the
 * totals under-count. A chart quietly missing its busiest week is worse than
 * one labelled incomplete.
 *
 * **Unconfigured is not zero.** When Stripe has no key the revenue tile says it
 * is switched off and offers no Retry, because a Retry that can only fail is
 * worse than no button — the same rule photo storage and the coach follow. A
 * zero MRR and an unknown MRR are different claims.
 *
 * The bars are plain Views rather than a chart library: four sparklines do not
 * justify a dependency, and a native chart package would force a new dev-client
 * build before anyone could see them.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { fetchRevenue, fetchTrends, type Revenue, type TrendPoint, type Trends } from "./adminApi";

const WINDOWS = [7, 30, 90] as const;

/** Whether a thrown error is "this isn't configured" rather than "this broke". */
function isUnconfigured(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  return msg.includes("aren't switched on") || msg.includes("not switched on");
}

export function TrendsScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Trends | null>(null);
  const [failed, setFailed] = useState<NetFailure | null>(null);

  // Three revenue outcomes, and they are not interchangeable: a figure, "not
  // switched on" (permanent, no retry), or "we couldn't reach Stripe" (worth
  // retrying). Collapsing them is how a zero starts looking like a fact.
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [revenueOff, setRevenueOff] = useState(false);
  const [revenueBroke, setRevenueBroke] = useState(false);

  const load = useCallback(async () => {
    setFailed(null);
    setData(null);
    try {
      setData(await fetchTrends(days));
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, [days]);

  const loadRevenue = useCallback(async () => {
    setRevenueOff(false);
    setRevenueBroke(false);
    try {
      setRevenue(await fetchRevenue());
    } catch (e) {
      if (isUnconfigured(e)) setRevenueOff(true);
      else setRevenueBroke(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRevenue();
  }, [loadRevenue]);

  return (
    <View style={styles.root}>
      <StaticBloom color={bio.color.blue} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Trends" label="Platform" onBack={onBack} />

        <View style={styles.tabs}>
          {WINDOWS.map((w) => (
            <Pressable
              key={w}
              onPress={() => {
                pressHaptic();
                setDays(w);
              }}
              style={({ pressed }) => [
                styles.tab,
                days === w && styles.tabOn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: days === w }}
              accessibilityLabel={`Last ${w} days`}
            >
              <Text style={[styles.tabText, days === w && styles.tabTextOn]}>{w}d</Text>
            </Pressable>
          ))}
        </View>

        <RevenueTile
          revenue={revenue}
          off={revenueOff}
          broke={revenueBroke}
          onRetry={() => void loadRevenue()}
        />

        {failed ? (
          <LoadFailed what="the trends" kind={failed} onRetry={() => void load()} />
        ) : data === null ? (
          <View style={styles.loading}>
            <Spinner tint={bio.color.text} />
          </View>
        ) : (
          <>
            {data.approximate ? (
              <Text style={styles.approx}>
                Some series hit the row limit, so the totals below under-count.
                The shape is right; the numbers are a floor.
              </Text>
            ) : null}

            <Series title="SIGN-UPS" points={data.series.signups} tint={bio.color.blueLt} />
            <Series
              title="STAFF VERIFIED"
              points={data.series.staffVerified}
              tint={bio.color.violetLt}
            />
            <Series title="BOOKINGS" points={data.series.bookings} tint={bio.color.tealLt} />
            <Series title="GYM VISITS" points={data.series.visits} tint={bio.color.amberLt} />

            <Text style={styles.footnote}>
              {data.from} to today · counted on the platform's own day boundary.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function RevenueTile({
  revenue,
  off,
  broke,
  onRetry,
}: {
  revenue: Revenue | null;
  off: boolean;
  broke: boolean;
  onRetry: () => void;
}) {
  if (off) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>REVENUE</Text>
        <Text style={styles.offTitle}>Payments aren't switched on</Text>
        {/* No Retry. This cannot come right by trying again — it needs a key. */}
        <Text style={styles.offBody}>
          Nothing is wrong. Add a Stripe key to this deploy and this fills in.
        </Text>
      </View>
    );
  }

  if (broke) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>REVENUE</Text>
        <Text style={styles.offTitle}>Couldn't reach Stripe</Text>
        <Pressable
          onPress={() => {
            pressHaptic();
            onRetry();
          }}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Try loading revenue again"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!revenue) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>REVENUE</Text>
        <View style={styles.tileLoading}>
          <Spinner tint={bio.color.blueLt} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardLabel}>REVENUE</Text>
        {revenue.mode === "test" ? (
          // A test-mode figure is not money. Never shown without saying so.
          <View style={styles.testChip}>
            <Text style={styles.testChipText}>TEST MODE</Text>
          </View>
        ) : null}
      </View>

      {revenue.mrr.length === 0 ? (
        <Text style={styles.mrrNone}>No active subscriptions.</Text>
      ) : (
        revenue.mrr.map((m) => (
          // Per currency, never summed across them — adding £ to € produces a
          // number that is not any amount of money.
          <Text key={m.currency} style={styles.mrr}>
            {m.formatted} <Text style={styles.mrrUnit}>{m.currency} MRR</Text>
          </Text>
        ))
      )}

      <Text style={styles.cardMeta}>
        {revenue.paying} paying
        {revenue.trialing > 0 ? ` · ${revenue.trialing} trialing` : ""}
        {/* Two numbers that look alike and are not. `paidSessions` is Stripe's;
            `bookedSessions` is ours. Merging them would be the lie. */}
        {revenue.paidSessions !== null ? ` · ${revenue.paidSessions} paid sessions` : ""}
        {` · ${revenue.bookedSessions} booked`}
      </Text>
      <Text style={styles.cardNote}>No history — Stripe reports today, not August.</Text>
    </View>
  );
}

/**
 * One series as a bar row.
 *
 * Every day in the window is drawn, including the empty ones: dropping quiet
 * days compresses the gaps and makes a flat month look like steady growth.
 */
function Series({
  title,
  points,
  tint,
}: {
  title: string;
  points: TrendPoint[];
  tint: string;
}) {
  const total = points.reduce((n, p) => n + p.count, 0);
  const peak = points.reduce((n, p) => Math.max(n, p.count), 0);

  return (
    <View style={styles.series}>
      <View style={styles.seriesTop}>
        <Text style={styles.seriesTitle}>{title}</Text>
        <Text style={styles.seriesTotal}>{total}</Text>
      </View>
      {total === 0 ? (
        <Text style={styles.seriesNone}>Nothing in this window.</Text>
      ) : (
        <View style={styles.bars}>
          {points.map((p) => (
            <View
              key={p.date}
              style={[
                styles.bar,
                {
                  // A day with something in it never renders as nothing: the
                  // floor keeps one event visible next to a peak of sixty.
                  height: p.count === 0 ? 1 : Math.max(3, Math.round((p.count / peak) * 44)),
                  backgroundColor: p.count === 0 ? bio.alpha(0.08) : tint,
                },
              ]}
              accessibilityLabel={`${p.date}: ${p.count}`}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  content: { paddingHorizontal: 20 },

  tabs: { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 16 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    backgroundColor: bio.color.surface,
  },
  tabOn: { borderColor: bio.blueAlpha(0.55), backgroundColor: bio.blueAlpha(0.12) },
  tabText: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.6) },
  tabTextOn: { color: bio.color.blueLt },
  pressed: { transform: [{ scale: 0.97 }] },

  card: {
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.card,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    padding: 16,
    marginBottom: 20,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: bio.alpha(0.4),
  },
  testChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.amberAlpha(0.16),
  },
  testChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: bio.color.amberLt,
  },
  mrr: { fontFamily: fontFamily.semibold, fontSize: 28, color: bio.color.text, marginTop: 8 },
  mrrUnit: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.4) },
  mrrNone: { fontFamily: fontFamily.regular, fontSize: 15, color: bio.alpha(0.5), marginTop: 10 },
  cardMeta: { fontFamily: fontFamily.regular, fontSize: 12, color: bio.alpha(0.45), marginTop: 6 },
  cardNote: { fontFamily: fontFamily.regular, fontSize: 11, color: bio.alpha(0.3), marginTop: 6 },
  offTitle: { fontFamily: fontFamily.semibold, fontSize: 16, color: bio.color.text, marginTop: 8 },
  offBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: bio.alpha(0.45),
    marginTop: 4,
    lineHeight: 19,
  },
  retry: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
  },
  retryText: { fontFamily: fontFamily.medium, fontSize: 13, color: bio.alpha(0.7) },
  tileLoading: { paddingVertical: 20, alignItems: "flex-start" },

  approx: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: bio.color.amberLt,
    marginBottom: 18,
    lineHeight: 18,
  },

  series: { marginBottom: 26 },
  seriesTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  seriesTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: bio.alpha(0.4),
  },
  seriesTotal: { fontFamily: fontFamily.semibold, fontSize: 18, color: bio.color.text },
  seriesNone: { fontFamily: fontFamily.regular, fontSize: 13, color: bio.alpha(0.35), marginTop: 8 },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 48,
    marginTop: 10,
  },
  bar: { flex: 1, borderRadius: 1.5, minWidth: 1 },

  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: bio.alpha(0.3),
    textAlign: "center",
    marginTop: 4,
  },
  loading: { paddingVertical: 48, alignItems: "center" },
});
