/**
 * Glass input field — a frosted field with a small uppercase label above the
 * value, per the BIOSYNC auth screens. Passes all TextInput props through.
 */
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { bio, fontFamily } from "../theme";

export function GlassField({ label, style, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <BlurView intensity={16} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[bio.color.glassHi, bio.color.glassLo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, style]} placeholderTextColor={bio.alpha(0.35)} selectionColor={bio.color.tealLt} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 64,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: bio.color.border,
    justifyContent: "center",
    paddingHorizontal: 18,
    gap: 3,
  },
  label: { fontFamily: fontFamily.semibold, fontSize: 10, letterSpacing: 1.4, color: bio.alpha(0.45), textTransform: "uppercase" },
  input: { fontFamily: fontFamily.medium, fontSize: 15, color: bio.color.text, padding: 0 },
});
