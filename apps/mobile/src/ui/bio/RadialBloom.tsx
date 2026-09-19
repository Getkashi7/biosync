/**
 * A single still radial bloom, positioned by offset.
 *
 * Distinct from `StaticBloom`, which is a flat circle at a low opacity centred
 * at the top — an approximation that predates the §6 handoff. The A1–A6 bundle
 * specifies an actual radial gradient anchored top-left
 * (`radial-gradient(circle, rgba(94,212,192,.08), transparent 70%)`), and a
 * hard-edged circle at 8% does not read the same: it has a visible boundary
 * where the gradient has none.
 *
 * Per CLAUDE.md the faithful native translation of a radial gradient is
 * `react-native-svg`'s `<RadialGradient>`, not an opacity trick — so that is
 * what this is. Nothing animates; the staff and gym surfaces get one quiet
 * wash, never `AuroraField`'s breathing.
 */
import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

export function RadialBloom({
  color,
  size,
  left = 0,
  top = 0,
  /** alpha at the centre; the edge is always fully transparent */
  alpha = 0.08,
  /** where the fade reaches zero, as a percentage of the radius */
  fadeAt = 70,
}: {
  color: string;
  size: number;
  left?: number;
  top?: number;
  alpha?: number;
  fadeAt?: number;
}) {
  // `useId` yields colons, which are not valid in an SVG fragment identifier.
  const id = `bloom${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Svg width={size} height={size} style={[styles.svg, { left, top }]}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={alpha} />
            <Stop offset={`${fadeAt}%`} stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clipped, so a bloom hanging off the top-left corner does not widen the
  // screen or become scrollable.
  wrap: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  svg: { position: "absolute" },
});
