/**
 * Download your data — the other half of the right that "Delete account"
 * already honours.
 *
 * `account.exportData` has existed server-side for a while with nothing calling
 * it, which meant BIOSYNC could erase everything it held about someone and not
 * hand it over. Deletion and portability are two halves of the same obligation
 * under UK GDPR (Articles 17 and 20), and shipping one without the other is
 * the half that benefits us.
 *
 * **What this screen does NOT do is write a file.** `expo-file-system` and
 * `expo-sharing` are native modules, and adding one forces a new APK before any
 * of this works at all. Copying to the clipboard and using the system share
 * sheet are both available today and both genuinely hand the data over, so that
 * is what ships — and the copy says plainly that photo links expire, because
 * an export whose images 404 next week is a worse promise than one that says so.
 *
 * The summary above the buttons is not decoration. Somebody exercising a data
 * right is entitled to see what they are getting before they get it, and a
 * spinner followed by a wall of JSON tells them nothing about whether anything
 * is missing.
 */
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { StaticBloom } from "../../ui/bio/StaticBloom";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { errorHaptic, pressHaptic, successHaptic } from "../../lib/haptics";
import { exportData, summariseExport, type ExportBundle } from "./accountApi";

export function ExportDataScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [copied, setCopied] = useState(false);

  const build = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setFailed(null);
    setCopied(false);
    try {
      setBundle(await exportData());
      successHaptic();
    } catch (e) {
      errorHaptic();
      setFailed(classifyNetError(e));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const copy = useCallback(async () => {
    if (!bundle) return;
    pressHaptic();
    try {
      await Clipboard.setStringAsync(JSON.stringify(bundle, null, 2));
      setCopied(true);
      successHaptic();
    } catch {
      errorHaptic();
      setCopied(false);
    }
  }, [bundle]);

  const share = useCallback(async () => {
    if (!bundle) return;
    pressHaptic();
    try {
      await Share.share({
        title: "My BIOSYNC data",
        message: JSON.stringify(bundle, null, 2),
      });
    } catch {
      // The user dismissing the share sheet lands here too, which is not an
      // error worth showing them.
    }
  }, [bundle]);

  const rows = bundle ? summariseExport(bundle) : [];

  return (
    <View style={styles.root}>
      <StaticBloom color={bio.color.violet} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Your data" label="Account" onBack={onBack} />

        <Text style={styles.lede}>
          Everything BIOSYNC holds for your account, as one JSON file you can keep
          or take elsewhere.
        </Text>

        {failed ? (
          <LoadFailed what="your data" kind={failed} onRetry={() => void build()} />
        ) : bundle === null ? (
          <>
            <Pressable
              onPress={() => void build()}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                loading && styles.btnOff,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Prepare my data"
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <Spinner tint={bio.color.onViolet} />
              ) : (
                <Text style={styles.primaryBtnText}>Prepare my data</Text>
              )}
            </Pressable>
            <Text style={styles.footnote}>
              Nothing leaves your phone until you choose to copy or share it.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.section}>WHAT'S IN IT</Text>
            <View style={styles.card}>
              {rows.map((r, i) => (
                <View key={r.label} style={[styles.row, i > 0 && styles.rowSep]}>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  {/* Zero is printed, not hidden. "0 meals" is information; an
                      omitted row reads as though the export forgot them. */}
                  <Text style={[styles.rowCount, r.count === 0 && styles.rowCountZero]}>
                    {r.count}
                  </Text>
                </View>
              ))}
            </View>

            {bundle.notes.map((n) => (
              <Text key={n} style={styles.note}>
                · {n}
              </Text>
            ))}

            <Pressable
              onPress={() => void copy()}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Copy my data to the clipboard"
            >
              <Text style={styles.primaryBtnText}>
                {copied ? "Copied to clipboard" : "Copy to clipboard"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => void share()}
              style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Share my data"
            >
              <Text style={styles.ghostBtnText}>Share…</Text>
            </Pressable>

            <Pressable
              onPress={() => void build()}
              disabled={loading}
              style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Build a fresh export"
            >
              <Text style={styles.ghostBtnText}>
                {loading ? "…" : "Refresh (new photo links)"}
              </Text>
            </Pressable>

            <Text style={styles.footnote}>
              Exported {new Date(bundle.exportedAt).toLocaleString()} · format{" "}
              {bundle.format}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  content: { paddingHorizontal: 20 },
  pressed: { transform: [{ scale: 0.97 }] },

  lede: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: bio.alpha(0.55),
    marginTop: 12,
    marginBottom: 22,
    lineHeight: 21,
  },
  section: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: bio.alpha(0.4),
    marginBottom: 10,
  },
  card: {
    backgroundColor: bio.color.surface,
    borderRadius: bio.radius.card,
    borderWidth: 1,
    borderColor: bio.color.hairline,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
  },
  rowSep: { borderTopWidth: 1, borderTopColor: bio.color.hairline },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: 14, color: bio.alpha(0.7) },
  rowCount: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text },
  rowCountZero: { color: bio.alpha(0.3) },

  note: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: bio.alpha(0.38),
    lineHeight: 17,
    marginTop: 10,
  },

  primaryBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.color.violetDeep,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryBtnText: { fontFamily: fontFamily.semibold, fontSize: 15, color: bio.color.onViolet },
  ghostBtn: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: bio.radius.pill,
    borderWidth: 1,
    borderColor: bio.color.border2,
    alignItems: "center",
  },
  ghostBtnText: { fontFamily: fontFamily.medium, fontSize: 14, color: bio.alpha(0.7) },
  btnOff: { opacity: 0.5 },

  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: bio.alpha(0.32),
    textAlign: "center",
    marginTop: 16,
    lineHeight: 16,
  },
});
