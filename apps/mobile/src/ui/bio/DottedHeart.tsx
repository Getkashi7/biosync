/**
 * BIOSYNC mark — a heart drawn as glowing dots, gently beating. The brand glyph
 * (welcome, splash, icon). Points are the classic heart parametric, normalised
 * into a square and rendered as absolutely-positioned dots.
 */
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { bio } from "../theme";

const N = 16;
const PTS = Array.from({ length: N }, (_, i) => {
  const t = (i / N) * Math.PI * 2;
  return {
    x: 16 * Math.pow(Math.sin(t), 3),
    y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
  };
});
const XS = PTS.map((p) => p.x);
const YS = PTS.map((p) => p.y);
const MINX = Math.min(...XS);
const MINY = Math.min(...YS);
const W = Math.max(...XS) - MINX;
const H = Math.max(...YS) - MINY;

export function DottedHeart({
  size = 60,
  dotSize = 4.4,
  color = bio.color.coralLt,
  beat = true,
}: {
  size?: number;
  dotSize?: number;
  color?: string;
  beat?: boolean;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!beat) return;
    p.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [p, beat]);
  const beatStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + p.value * 0.14 }], opacity: 0.85 + p.value * 0.15 }));

  const scale = (size * 0.9) / Math.max(W, H);
  const offX = (size - W * scale) / 2;
  const offY = (size - H * scale) / 2;

  return (
    <Animated.View style={[{ width: size, height: size }, beatStyle]}>
      {PTS.map((pt, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: (pt.x - MINX) * scale + offX,
            top: (pt.y - MINY) * scale + offY,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
            shadowColor: bio.color.coral,
            shadowRadius: 6,
            shadowOpacity: 0.8,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
      ))}
    </Animated.View>
  );
}
