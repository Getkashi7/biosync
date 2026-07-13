/**
 * Simple centered empty-state used by every tab that isn't built yet. The Home
 * tab uses it to nudge the first check-in; the others say "Coming soon".
 */
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RiseIn } from "../../ui/RiseIn";
import { color, space, type } from "../../ui/theme";

export function Placeholder({ title, subtitle, footer }: { title: string; subtitle?: string; footer?: ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <RiseIn index={0}>
          <Text style={styles.title}>{title}</Text>
        </RiseIn>
        {subtitle ? (
          <RiseIn index={1}>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </RiseIn>
        ) : null}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...type.greeting,
    color: color.text,
    textAlign: "center",
  },
  subtitle: {
    ...type.body,
    color: color.textSecondary,
    textAlign: "center",
    marginTop: space.md,
    maxWidth: 280,
  },
  footer: {
    paddingBottom: space.lg,
  },
});
