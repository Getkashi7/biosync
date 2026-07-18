/**
 * Glass surface — a frosted translucent card: a real blur layer (expo-blur) over
 * whatever aurora sits behind, a soft white gradient sheen, and a 1px light
 * border. The BIOSYNC card primitive; children render above the frost.
 *
 * `expo-blur` is native, so the blur only renders on the dev/native build (a
 * plain View fallback shows elsewhere). Radius clips the blur via overflow.
 */
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { bio } from "../theme";

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** inner padding (applied to the content layer) */
  padding?: number;
  radius?: number;
  intensity?: number;
  /** softer sheen for secondary tiles */
  soft?: boolean;
  borderColor?: string;
  /** make the content layer fill the surface height (for fixed-height tiles) */
  fill?: boolean;
};

export function GlassSurface({
  children,
  style,
  padding,
  radius = bio.radius.card,
  intensity = 22,
  soft = false,
  borderColor = bio.color.border,
  fill = false,
}: Props) {
  return (
    <View style={[{ borderRadius: radius, overflow: "hidden", borderWidth: 1, borderColor }, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={soft ? [bio.color.glassHi2, bio.color.glassLo2] : [bio.color.glassHi, bio.color.glassLo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[fill ? styles.fill : null, padding != null ? { padding } : null]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
