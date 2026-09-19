/**
 * The header the A1–A6 gym bundle uses: a bare chevron, the title, and the
 * section label all on one line.
 *
 * Deliberately NOT `ScreenHeader`, which puts a 21px title above its label
 * inside a 36px glass circle. Seven older screens depend on that treatment and
 * their own designs specify it, so bending it to suit this handoff would
 * restyle all of them silently. Two headers is the honest answer when two
 * design bundles genuinely disagree.
 *
 * Extracted at its second use (A1 and A6), rather than at the seventh like
 * `ScreenHeader` was — the handoff makes it clear the whole bundle shares it,
 * so waiting would only mean editing every screen again later.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { bio, fontFamily } from "../theme";
import { pressHaptic } from "../../lib/haptics";

export function FlatHeader({
  title,
  label,
  onBack,
}: {
  title: string;
  /** the small uppercase word at the right — "Gym", "Coach", "Platform" */
  label: string;
  /** omitted on a tab root, which has nothing to go back to */
  onBack?: (() => void) | undefined;
}) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={() => {
            pressHaptic();
            onBack();
          }}
          // The chevron is 8×14; the touch target must not be.
          hitSlop={16}
          style={({ pressed }) => [pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
            <Path
              d="M7 1L1.6 7L7 13"
              stroke={bio.alpha(0.62)}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      ) : null}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  title: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 17, color: bio.alpha(0.98) },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: bio.alpha(0.38),
  },
  pressed: { transform: [{ scale: 0.97 }] },
});
