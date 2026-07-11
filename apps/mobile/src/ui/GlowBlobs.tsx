/**
 * Ambient radial glow blobs behind every auth screen.
 *
 * expo-linear-gradient can't do radial, so each blob is a react-native-svg
 * <RadialGradient>. We animate transform only (drift) on the UI thread — the
 * gradient itself never re-renders. Purple blob top-left, magenta/orange
 * blob bottom-right.
 */
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { gradient, motion } from "./theme";

type BlobProps = {
  size: number;
  colorInner: string;
  colorMid: string;
  duration: number;
  reverse: boolean;
  style: object;
};

function Blob({ size, colorInner, colorMid, duration, reverse, style }: BlobProps) {
  const t = useSharedValue(0);

  useEffect(() => {
    // 0 -> 1 progress, ping-ponging forever (Easing.inOut(sin)-like drift).
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [duration, t]);

  const animatedStyle = useAnimatedStyle(() => {
    const dir = reverse ? -1 : 1;
    return {
      transform: [
        { translateX: dir * 30 * t.value },
        { translateY: dir * 24 * t.value },
        { scale: 1 + 0.08 * t.value },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: size, height: size }, style, animatedStyle]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="g" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colorInner} />
            <Stop offset="50%" stopColor={colorMid} />
            <Stop offset="72%" stopColor={colorInner} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill="url(#g)" />
      </Svg>
    </Animated.View>
  );
}

export function GlowBlobs() {
  const { purple, magenta } = gradient.glow;
  return (
    <>
      <Blob
        size={purple.size}
        colorInner={purple.color}
        colorMid={purple.mid}
        duration={motion.drift1}
        reverse={false}
        style={{ top: -140, left: -120 }}
      />
      <Blob
        size={magenta.size}
        colorInner={magenta.color}
        colorMid={magenta.mid}
        duration={motion.drift2}
        reverse
        style={{ bottom: -180, right: -160 }}
      />
    </>
  );
}

export const glowStyles = StyleSheet.create({});
