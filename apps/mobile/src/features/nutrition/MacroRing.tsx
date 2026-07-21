/**
 * Macro ring — one of the three nutrition gauges: the shared dotted ring in
 * amber, with the Doto grams-over-target in the middle and the macro name below.
 */
import { StyleSheet, Text, View } from "react-native";
import { DottedRing } from "../../ui/bio/DottedRing";
import { bio, fontFamily } from "../../ui/theme";

const SIZE = 98;
const RADIUS = 43;

type Props = {
  label: string;
  /** grams consumed */
  value: number;
  /** grams targeted */
  target: number;
  /** 0–1+; the ring clamps it, the raw value still shows in the middle */
  progress: number;
  /** stagger, so the three rings draw in sequence */
  delayMs?: number;
};

export function MacroRing({ label, value, target, progress, delayMs = 0 }: Props) {
  return (
    <View style={styles.wrap}>
      <DottedRing size={SIZE} radius={RADIUS} progress={progress} color={bio.color.amber} delayMs={delayMs}>
        <View style={styles.centre}>
          <Text style={styles.value}>{Math.round(value)}</Text>
          <Text style={styles.target}>/ {Math.round(target)} g</Text>
        </View>
      </DottedRing>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, alignItems: "center" },
  centre: { alignItems: "center", justifyContent: "center" },
  value: { fontFamily: fontFamily.dot, fontSize: 23, letterSpacing: 0.9, color: bio.color.text },
  target: { fontFamily: fontFamily.semibold, fontSize: 9.5, color: bio.alpha(0.4), marginTop: 2 },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: bio.alpha(0.5),
    marginTop: 10,
  },
});
