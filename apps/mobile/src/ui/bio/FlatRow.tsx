/**
 * The N2 list: flat rows on the canvas, a hairline between, a chevron at 30%.
 *
 * `FlatSection` draws the label and owns the hairlines, so a row never has to
 * know whether it is first. That is the whole reason this is a primitive — You,
 * Preferences and Home's shortcuts all use it, and getting the first-row border
 * wrong three times is how lists start to look slightly off.
 */
import { Children, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { pressHaptic } from "../../lib/haptics";
import { bio } from "../theme";

const f = bio.flat;

export function FlatSection({ label, children }: { label?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View>
      {label ? <Text style={styles.section}>{label.toUpperCase()}</Text> : null}
      <View style={styles.rows}>
        {rows.map((row, i) => (
          <View key={i} style={i > 0 ? styles.divided : null}>
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

export function FlatRow({
  label,
  value,
  onPress,
  danger = false,
}: {
  label: string;
  /** a short value at 45%, right-aligned before the chevron */
  value?: string | undefined;
  onPress: () => void;
  /** coral label, no chevron — the design's treatment for Delete account */
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        pressHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      <Text style={[styles.label, danger && styles.danger]} numberOfLines={1}>
        {label}
      </Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {danger ? null : (
        <Svg width={f.chevron.width} height={f.chevron.height} viewBox="0 0 8 14" fill="none">
          <Path
            d="M1.4 1.4 6.4 7l-5 5.6"
            stroke={bio.alpha(0.3)}
            strokeWidth={f.chevron.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    ...f.section,
    color: bio.alpha(0.38),
    paddingHorizontal: f.gutter,
    paddingTop: f.sectionPad.top,
    paddingBottom: f.sectionPad.bottom,
  },
  rows: { paddingHorizontal: f.gutter },
  divided: { borderTopWidth: 1, borderTopColor: bio.color.hairline },
  row: { height: f.rowHeight, flexDirection: "row", alignItems: "center", gap: 12 },
  pressed: { transform: [{ scale: 0.97 }] },
  label: { ...f.row, flex: 1, minWidth: 0, color: bio.color.white },
  danger: { color: bio.color.coral },
  value: { ...f.value, color: bio.alpha(0.45) },
});
