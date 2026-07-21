/**
 * Shown when someone signs in through the professional door with an account
 * that holds no verified staff capability.
 *
 * Deliberately plain: it isn't an error and it isn't a rejection of them as a
 * person — their personal app is right there. It also doesn't hint at how to
 * obtain access, because capability is granted by an admin after checking
 * credentials, not by anything the user can do here.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bio, fontFamily } from "../../ui/theme";
import { pressHaptic } from "../../lib/haptics";

export function NotProfessional({ onUsePersonal }: { onUsePersonal: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.centre}>
        <View style={styles.mark}>
          <View style={[styles.markBar, { height: 12 }]} />
          <View style={[styles.markBar, { height: 24 }]} />
          <View style={[styles.markBar, { height: 18 }]} />
        </View>

        <Text style={styles.title}>This account isn’t registered as a professional</Text>
        <Text style={styles.body}>
          Professional access is set up by the BIOSYNC team once your credentials have been checked. If you think
          this is a mistake, get in touch and we’ll take a look.
        </Text>

        <Pressable
          onPress={() => {
            pressHaptic();
            onUsePersonal();
          }}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Continue to my BIOSYNC</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.ink, paddingHorizontal: 28 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  mark: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 24 },
  markBar: { width: 5, borderRadius: 2, backgroundColor: bio.tealAlpha(0.5) },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 27,
    color: bio.color.text,
    textAlign: "center",
    maxWidth: 290,
    marginTop: 24,
  },
  body: {
    fontFamily: fontFamily.light,
    fontSize: 13.5,
    lineHeight: 21,
    color: bio.alpha(0.55),
    textAlign: "center",
    maxWidth: 300,
    marginTop: 12,
  },
  cta: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: bio.radius.pill,
    backgroundColor: bio.alpha(0.07),
    borderWidth: 1,
    borderColor: bio.color.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },
  ctaText: { fontFamily: fontFamily.semibold, fontSize: 14, color: bio.color.text },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
