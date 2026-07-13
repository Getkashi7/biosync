/**
 * Text painted with the brand gradient (orange → coral → blue).
 *
 * RN can't fill glyphs with a gradient directly, so the text is used as a mask
 * over a <LinearGradient>. Used for the slider hours readout and the streak count.
 */
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, type TextStyle } from "react-native";
import { gradient } from "./theme";

type Props = {
  children: string;
  style?: TextStyle | TextStyle[];
};

export function GradientText({ children, style }: Props) {
  return (
    <MaskedView
      maskElement={
        <Text style={[style, styles.mask]} allowFontScaling={false}>
          {children}
        </Text>
      }
    >
      <LinearGradient
        colors={gradient.brandColors}
        locations={gradient.brandLocations}
        start={gradient.ctaStart}
        end={gradient.ctaEnd}
      >
        {/* Invisible twin sizes the gradient to the glyphs. */}
        <Text style={[style, styles.ghost]} allowFontScaling={false}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  mask: { backgroundColor: "transparent" },
  ghost: { opacity: 0 },
});
