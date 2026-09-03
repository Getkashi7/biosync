/**
 * Progress photos — the gallery (design 1A) and its empty state (1B).
 *
 * A dated 3-column grid grouped by month, newest first. Three things this
 * screen refuses to do, each of them a promise the design makes:
 *
 * - **Failed never looks like empty.** A load failure keeps the header and
 *   renders LoadFailed; only a genuinely empty timeline shows the dotted frame.
 * - **An upload in flight, or one that failed, lives in the grid** as its own
 *   tile — never a silent drop, and a failed one offers Retry.
 * - **The lock chip appears only when a photo differs from the gallery
 *   default**, so it means "this one is different", not decoration.
 */
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { AuroraField } from "../../ui/bio/AuroraField";
import { ScreenHeader } from "../../ui/bio/ScreenHeader";
import { Spinner } from "../../ui/Spinner";
import { LoadFailed } from "../../ui/bio/LoadFailed";
import { classifyNetError, type NetFailure } from "../../lib/netError";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";
import { groupPhotosByMonth, tilePhotoDate, photoHasOverride } from "../../lib/photoFormat";
import { fetchPhotos, fetchPhotosAudience, type ConsentAudience, type Photo } from "./photosApi";

/** An upload the user started that hasn't landed yet. */
export type PendingUpload = {
  key: string;
  takenOn: string;
  /** 0–100, or null once it has failed */
  progress: number | null;
  failed: boolean;
};

const S = bio.photos;

/** Placeholder tints, so a photo whose URL failed still reads as a photo slot. */
const TILE_TINTS: [string, string][] = [
  ["#2E2A38", "#1A1724"],
  ["#28303A", "#151B22"],
  ["#332B33", "#1D1620"],
  ["#2A2D32", "#17191D"],
];

export function PhotosGalleryScreen({
  onBack,
  onAdd,
  onOpenPhoto,
  onCompare,
  pending,
  onRetry,
  refreshKey,
}: {
  onBack: () => void;
  onAdd: () => void;
  onOpenPhoto: (id: string) => void;
  onCompare: () => void;
  pending: PendingUpload[];
  onRetry: (key: string) => void;
  refreshKey: number;
}) {
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [audience, setAudience] = useState<ConsentAudience>("NONE");
  const [failed, setFailed] = useState<NetFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      // The gallery-wide default decides which tiles get a lock chip, so both
      // land together — a chip drawn against a stale default would mark the
      // wrong photos as private.
      const [list, aud] = await Promise.all([fetchPhotos(), fetchPhotosAudience()]);
      setPhotos(list);
      setAudience(aud);
    } catch (e) {
      setFailed(classifyNetError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const months = groupPhotosByMonth(photos ?? []);
  const privateCount = (photos ?? []).filter((p) => photoHasOverride(p.audienceOverride, audience)).length;
  const isEmpty = photos !== null && photos.length === 0 && pending.length === 0;

  return (
    <View style={styles.root}>
      <AuroraField
        blobs={[
          { hue: bio.aurora.violet, size: 460, cx: true, top: -70, stops: [{ o: 0, a: 0.32 }, { o: 46, a: 0.1 }, { o: 72, a: 0 }] },
          { hue: bio.aurora.blue, size: 300, right: -120, bottom: 150, variant: "b", stops: [{ o: 0, a: 0.12 }, { o: 70, a: 0 }] },
        ]}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 112 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={bio.alpha(0.5)} />
        }
      >
        <ScreenHeader
          title="Progress photos"
          label="Profile"
          onBack={onBack}
          right={
            photos && photos.length > 1 ? (
              <Pressable
                onPress={() => {
                  pressHaptic();
                  onCompare();
                }}
                style={({ pressed }) => [styles.compareBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Compare two photos"
              >
                <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                  <Rect x={0.8} y={0.8} width={8} height={8} rx={2.4} stroke={bio.color.violetChip} strokeWidth={1.6} />
                  <Rect x={5.2} y={5.2} width={8} height={8} rx={2.4} fill={bio.violetAlpha(0.2)} stroke={bio.color.violetChip} strokeWidth={1.6} />
                </Svg>
              </Pressable>
            ) : undefined
          }
        />

        {failed ? (
          <View style={styles.failWrap}>
            <LoadFailed what="your photos" kind={failed} onRetry={() => void load()} />
          </View>
        ) : photos === null ? (
          <View style={styles.loadWrap}>
            <Spinner />
          </View>
        ) : isEmpty ? (
          <EmptyGallery onAdd={onAdd} />
        ) : (
          <>
            <SharingLine audience={audience} privateCount={privateCount} />
            <View style={styles.months}>
              {pending.length > 0 ? (
                <View style={styles.month}>
                  <View style={styles.monthHead}>
                    <Text style={styles.monthName}>Uploading</Text>
                    <Text style={styles.monthCount}>{pending.length}</Text>
                  </View>
                  <View style={styles.grid}>
                    {pending.map((p) =>
                      p.failed ? (
                        <FailedTile key={p.key} onRetry={() => onRetry(p.key)} />
                      ) : (
                        <UploadingTile key={p.key} progress={p.progress ?? 0} />
                      ),
                    )}
                  </View>
                </View>
              ) : null}

              {months.map((m) => (
                <View key={m.heading} style={styles.month}>
                  <View style={styles.monthHead}>
                    <Text style={styles.monthName}>{m.heading}</Text>
                    <Text style={styles.monthCount}>{m.photos.length}</Text>
                  </View>
                  <View style={styles.grid}>
                    {m.photos.map((p, i) => (
                      <PhotoTile
                        key={p.id}
                        photo={p}
                        tint={TILE_TINTS[i % TILE_TINTS.length] ?? TILE_TINTS[0]!}
                        locked={photoHasOverride(p.audienceOverride, audience)}
                        onPress={() => onOpenPhoto(p.id)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {!failed && photos !== null && !isEmpty ? (
        <Pressable
          onPress={() => {
            pressHaptic();
            onAdd();
          }}
          style={({ pressed }) => [styles.fab, { bottom: insets.bottom + S.fab.bottom }, pressed && styles.fabPressed]}
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
        >
          <LinearGradient
            colors={[bio.color.violet, bio.color.violetDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabFill}
          >
            <Svg width={18} height={18} viewBox="0 0 18 18">
              <Rect x={7.9} y={0} width={2.2} height={18} rx={1.1} fill={bio.color.onViolet} />
              <Rect x={0} y={7.9} width={18} height={2.2} rx={1.1} fill={bio.color.onViolet} />
            </Svg>
          </LinearGradient>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Who the gallery is shared with, stated plainly rather than left to a chip. */
function SharingLine({ audience, privateCount }: { audience: ConsentAudience; privateCount: number }) {
  const who =
    audience === "TRAINER" ? "your trainer" : audience === "PRACTITIONER" ? "your practitioner" : null;
  return (
    <Text style={styles.sharing}>
      {who === null ? (
        <>
          Visible only to you. <Text style={styles.sharingStrong}>No one else</Text> can see these.
        </>
      ) : (
        <>
          Shared with <Text style={styles.sharingStrong}>{who}</Text>
          {privateCount > 0 ? (
            <>
              {" · "}
              <Text style={styles.sharingStrong}>{privateCount}</Text>
              {privateCount === 1 ? " photo kept private" : " photos kept private"}
            </>
          ) : null}
        </>
      )}
    </Text>
  );
}

function PhotoTile({
  photo,
  tint,
  locked,
  onPress,
}: {
  photo: Photo;
  tint: [string, string];
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        pressHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      accessibilityRole="button"
      accessibilityLabel={`Photo from ${tilePhotoDate(photo.takenOn)}${locked ? ", visibility differs from your default" : ""}`}
    >
      {/* The tint sits underneath as the placeholder the design specifies, so a
          photo whose signed URL expired or failed still reads as a photo slot
          rather than a hole in the grid. */}
      <LinearGradient colors={tint} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      {photo.url ? (
        <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <LinearGradient
        colors={["rgba(7,7,12,0)", "rgba(7,7,12,0.62)"]}
        style={styles.tileScrim}
        pointerEvents="none"
      />
      <Text style={styles.tileDate}>{tilePhotoDate(photo.takenOn)}</Text>
      {locked ? (
        <View style={styles.lockChip}>
          <Svg width={10} height={11} viewBox="0 0 10 11" fill="none">
            <Path d="M2.6 4.4V3.2a2.4 2.4 0 0 1 4.8 0v1.2" stroke={bio.alpha(0.85)} strokeWidth={1.4} strokeLinecap="round" />
            <Rect x={0.5} y={4.4} width={9} height={6} rx={1.5} fill={bio.alpha(0.85)} />
          </Svg>
        </View>
      ) : null}
    </Pressable>
  );
}

function UploadingTile({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  // A conic gradient isn't available in RN, so the ring is an SVG arc — same
  // read, and it animates on the UI thread rather than re-laying out.
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <View style={styles.pendingTile} accessibilityLabel={`Uploading, ${pct} percent`}>
      <View style={styles.ringWrap}>
        <Svg width={S.ring} height={S.ring} viewBox="0 0 34 34">
          <Circle cx={17} cy={17} r={r} stroke={bio.alpha(0.14)} strokeWidth={4} fill="none" />
          <Circle
            cx={17}
            cy={17}
            r={r}
            stroke={bio.color.violet}
            strokeWidth={4}
            fill="none"
            strokeDasharray={`${(c * pct) / 100} ${c}`}
            strokeLinecap="round"
            transform="rotate(-90 17 17)"
          />
        </Svg>
        <Text style={styles.ringPct}>{pct}</Text>
      </View>
      <Text style={styles.pendingLabel}>Uploading</Text>
    </View>
  );
}

function FailedTile({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.failedTile}>
      <View style={styles.failedBadge}>
        <Text style={styles.failedBang}>!</Text>
      </View>
      <Text style={styles.failedLabel}>Didn&apos;t upload</Text>
      <Pressable
        onPress={() => {
          pressHaptic();
          onRetry();
        }}
        style={({ pressed }) => [styles.retryPill, pressed && styles.retryPressed]}
        accessibilityRole="button"
        accessibilityLabel="Retry this upload"
      >
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function EmptyGallery({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyFrame}>
        <Svg width={30} height={26} viewBox="0 0 30 26" fill="none">
          <Path d="M10 4.5V3.2a1.6 1.6 0 0 1 1.6-1.6h6.8A1.6 1.6 0 0 1 20 3.2v1.3" stroke={bio.alpha(0.5)} strokeWidth={1.6} strokeLinecap="round" />
          <Rect x={0.8} y={4.5} width={28.4} height={20.7} rx={6} stroke={bio.alpha(0.5)} strokeWidth={1.6} />
          <Circle cx={15} cy={15} r={4.5} stroke={bio.alpha(0.5)} strokeWidth={1.6} />
        </Svg>
      </View>
      <Text style={styles.emptyTitle}>Your first photo starts the timeline.</Text>
      <Text style={styles.emptyBody}>
        Encrypted and stored privately. No one ever sees a photo unless you choose to share it.
      </Text>
      <Pressable
        onPress={() => {
          pressHaptic();
          onAdd();
        }}
        style={({ pressed }) => [styles.emptyCta, pressed && styles.ctaPressed]}
        accessibilityRole="button"
        accessibilityLabel="Add your first photo"
      >
        <LinearGradient
          colors={[bio.color.violet, bio.color.violetDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyCtaFill}
        >
          <Text style={styles.emptyCtaText}>Add your first photo</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 22 },
  loadWrap: { paddingTop: 120, alignItems: "center" },
  failWrap: { paddingTop: 60 },

  compareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: bio.violetAlpha(0.45),
    backgroundColor: bio.violetAlpha(0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { transform: [{ scale: 0.94 }] },

  sharing: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 19,
    color: bio.alpha(0.62),
    marginTop: 14,
  },
  sharingStrong: { fontFamily: fontFamily.semibold, color: bio.alpha(0.85) },

  months: { marginTop: 18, gap: 16 },
  month: { gap: 9 },
  monthHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  monthName: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.54,
    textTransform: "uppercase",
    color: bio.alpha(0.45),
  },
  monthCount: { fontFamily: fontFamily.dot, fontSize: 11, color: bio.alpha(0.35) },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.tile.gap },
  tile: {
    width: `${100 / 3}%`,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    maxWidth: 112,
    height: S.tile.height,
    borderRadius: S.tile.radius,
    overflow: "hidden",
  },
  tilePressed: { transform: [{ scale: 0.97 }] },
  tileScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: S.scrim },
  tileDate: {
    position: "absolute",
    left: 9,
    bottom: 8,
    fontFamily: fontFamily.dot,
    fontSize: 10,
    letterSpacing: 0.6,
    color: bio.alpha(0.9),
  },
  lockChip: {
    position: "absolute",
    top: 7,
    right: 7,
    width: S.lockChip,
    height: S.lockChip,
    borderRadius: S.lockChip / 2,
    backgroundColor: "rgba(11,11,18,0.78)",
    borderWidth: 1,
    borderColor: bio.alpha(0.2),
    alignItems: "center",
    justifyContent: "center",
  },

  pendingTile: {
    width: `${100 / 3}%`,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    maxWidth: 112,
    height: S.tile.height,
    borderRadius: S.tile.radius,
    backgroundColor: bio.alpha(0.045),
    borderWidth: 1,
    borderColor: bio.alpha(0.12),
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ringWrap: { width: S.ring, height: S.ring, alignItems: "center", justifyContent: "center" },
  ringPct: {
    position: "absolute",
    fontFamily: fontFamily.dot,
    fontSize: 9.5,
    color: bio.alpha(0.85),
  },
  pendingLabel: { fontFamily: fontFamily.semibold, fontSize: 9.5, color: bio.alpha(0.6) },

  failedTile: {
    width: `${100 / 3}%`,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    maxWidth: 112,
    height: S.tile.height,
    borderRadius: S.tile.radius,
    backgroundColor: "rgba(255,122,110,0.06)",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,122,110,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  failedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,154,144,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  failedBang: { fontFamily: fontFamily.bold, fontSize: 11, color: bio.color.coralLt2 },
  failedLabel: { fontFamily: fontFamily.semibold, fontSize: 9.5, color: bio.alpha(0.8) },
  retryPill: {
    height: 22,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: bio.alpha(0.28),
    alignItems: "center",
    justifyContent: "center",
  },
  retryPressed: { opacity: 0.6 },
  retryText: { fontFamily: fontFamily.bold, fontSize: 9.5, color: bio.color.text },

  empty: { alignItems: "center", paddingTop: 64, paddingHorizontal: 18 },
  emptyFrame: {
    width: S.emptyFrame.width,
    height: S.emptyFrame.height,
    borderRadius: S.emptyFrame.radius,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: bio.alpha(0.22),
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16.5,
    letterSpacing: -0.17,
    color: bio.color.text,
    marginTop: 24,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: fontFamily.light,
    fontSize: 12.5,
    lineHeight: 19,
    color: bio.alpha(0.55),
    marginTop: 9,
    textAlign: "center",
  },
  emptyCta: { alignSelf: "stretch", marginTop: 26, borderRadius: 16, overflow: "hidden" },
  emptyCtaFill: { height: 52, alignItems: "center", justifyContent: "center" },
  emptyCtaText: { fontFamily: fontFamily.bold, fontSize: 14.5, color: bio.color.onViolet },
  ctaPressed: { transform: [{ scale: 0.98 }] },

  fab: {
    position: "absolute",
    right: S.fab.right,
    width: S.fab.size,
    height: S.fab.size,
    borderRadius: S.fab.size / 2,
    overflow: "hidden",
  },
  fabPressed: { transform: [{ scale: 0.94 }] },
  fabFill: { flex: 1, alignItems: "center", justifyContent: "center" },
});
