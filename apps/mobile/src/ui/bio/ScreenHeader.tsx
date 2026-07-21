/**
 * The header every pushed feature screen shares: a glass back button, a title
 * with an uppercase label under it, and an optional trailing slot (a gauge, a
 * count, a mark).
 *
 * Extracted after seven screens grew their own identical copy.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { bio, fontFamily } from "../theme";
import { pressHaptic } from "../../lib/haptics";

type Props = {
  title: string;
  /** the small uppercase line under the title */
  label?: string;
  onBack: () => void;
  /** trailing element, e.g. an adherence ring or a count */
  right?: ReactNode;
};

export function ScreenHeader({ title, label, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          pressHaptic();
          onBack();
        }}
        style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Svg width={10} height={10} viewBox="0 0 10 10" fill="none">
          <Path
            d="M6.5 1 L2.5 5 L6.5 9"
            stroke={bio.alpha(0.8)}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>

      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}
      </View>

      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: bio.alpha(0.06),
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1 },
  title: { fontFamily: fontFamily.bold, fontSize: 21, letterSpacing: -0.21, color: bio.color.text },
  label: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 1.5, color: bio.alpha(0.45), marginTop: 3 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
