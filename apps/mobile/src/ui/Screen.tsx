/**
 * Full-bleed dark screen background with the ambient glow behind content.
 * Safe-area insets are consumed by each screen (headers/CTA blocks) via
 * useSafeAreaInsets so the glow can extend under the notch/home indicator.
 */
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { color } from "./theme";
import { GlowBlobs } from "./GlowBlobs";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <GlowBlobs />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
    overflow: "hidden",
  },
  content: {
    flex: 1,
  },
});
