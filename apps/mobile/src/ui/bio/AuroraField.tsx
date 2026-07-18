/**
 * Aurora field — the BIOSYNC signature: soft radial-gradient blooms that breathe
 * slowly behind content. Each blob is a react-native-svg RadialGradient on an
 * absolutely-positioned layer, its scale oscillating on the UI thread (Reanimated).
 *
 * Feed it blob specs; it renders a full-bleed, non-interactive background layer.
 */
import { useEffect } from "react";
import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { bio } from "../theme";

export type AuroraStop = { o: number; a: number };

export type AuroraBlob = {
  /** rgb triple, e.g. bio.aurora.violet ("167,139,250") */
  hue: string;
  size: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  /** horizontally centre the blob (design's left:50%;translateX(-50%)) */
  cx?: boolean;
  /** radial stops (offset % → alpha); defaults to a soft 3-stop bloom */
  stops?: AuroraStop[];
  /** "a" breathes bigger, "b" breathes smaller (design's breathe / breathe2) */
  variant?: "a" | "b";
  durationMs?: number;
  delayMs?: number;
};

const DEFAULT_STOPS: AuroraStop[] = [
  { o: 0, a: 0.4 },
  { o: 45, a: 0.13 },
  { o: 72, a: 0 },
];

function Blob({ blob }: { blob: AuroraBlob }) {
  const id = useId().replace(/:/g, "");
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(
      blob.delayMs ?? 0,
      withRepeat(withTiming(1, { duration: blob.durationMs ?? bio.motion.breathe, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [p, blob.delayMs, blob.durationMs]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale =
      blob.variant === "b" ? interpolate(p.value, [0, 1], [1.12, 0.94]) : interpolate(p.value, [0, 1], [1, 1.16]);
    return { transform: [{ scale }] };
  });

  const stops = blob.stops ?? DEFAULT_STOPS;
  const pos = {
    ...(blob.cx ? { left: "50%" as const, marginLeft: -blob.size / 2 } : {}),
    ...(blob.left != null ? { left: blob.left } : {}),
    ...(blob.right != null ? { right: blob.right } : {}),
    ...(blob.top != null ? { top: blob.top } : {}),
    ...(blob.bottom != null ? { bottom: blob.bottom } : {}),
  };

  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: blob.size, height: blob.size }, pos, animatedStyle]}>
      <Svg width={blob.size} height={blob.size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            {stops.map((s, i) => (
              <Stop key={i} offset={`${s.o}%`} stopColor={`rgb(${blob.hue})`} stopOpacity={s.a} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect width={blob.size} height={blob.size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

export function AuroraField({ blobs, opacity = 1 }: { blobs: AuroraBlob[]; opacity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity }]}>
      {blobs.map((b, i) => (
        <Blob key={i} blob={b} />
      ))}
    </View>
  );
}
