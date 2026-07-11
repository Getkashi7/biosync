/**
 * Pulse logo mark — a gradient disc with a punched-out dark dot (the "pulse").
 * Gradient runs 135° (top-left → bottom-right) per the design.
 */
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { color, gradient, size } from "./theme";

export function LogoMark({ diameter = size.logoDot }: { diameter?: number }) {
  const dot = Math.round(diameter * 0.27);
  const inset = Math.round(diameter * 0.36);
  return (
    <LinearGradient
      colors={gradient.brandColors}
      locations={gradient.brandLocations}
      start={gradient.logoStart}
      end={gradient.logoEnd}
      style={{ width: diameter, height: diameter, borderRadius: diameter / 2 }}
    >
      <View
        style={{
          position: "absolute",
          top: inset,
          left: inset,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color.bg,
        }}
      />
    </LinearGradient>
  );
}
