/**
 * A single, still background bloom.
 *
 * The staff surfaces deliberately don't use `AuroraField`: their brief calls for
 * one barely-there wash with no breathing or pulsing, so depth comes from
 * hairlines and type rather than moving light. This is that wash, in one place
 * rather than re-declared per screen.
 */
import { StyleSheet, View } from "react-native";
import { bio } from "../theme";

export function StaticBloom({
  color = bio.color.teal,
  opacity = 0.06,
}: {
  color?: string;
  opacity?: number;
}) {
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={[styles.bloom, { backgroundColor: color, opacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  bloom: {
    position: "absolute",
    width: 520,
    height: 400,
    left: "50%",
    marginLeft: -260,
    top: -150,
    borderRadius: 260,
  },
});
