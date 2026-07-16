/**
 * Profile tab, per the "Pulse Profile" design (frame 1): identity block
 * (initials avatar, name, email), PREFERENCES card (units toggle, reminders
 * placeholder), ACCOUNT card (sign out, delete-account entry point), and a
 * version footer. Real account deletion ships in Week 3 — the row opens the
 * confirm sheet, which owns that messaging.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { RiseIn } from "../../ui/RiseIn";
import { selectionHaptic } from "../../lib/haptics";
import { getUnitPref, setUnitPref, type WeightUnit } from "../../lib/prefs";
import { color, radius, size, space, type } from "../../ui/theme";
import { useAuth } from "../auth/AuthProvider";

/** "Maya Kessler" → "MK"; falls back to the email's first letter. */
function initialsOf(fullName: string | null, email: string): string {
  const words = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  if (words.length === 1 && words[0]!.length > 0) return words[0]![0]!.toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

type Props = {
  /** open the delete-account confirm sheet */
  onDeleteAccount: () => void;
};

export function ProfileScreen({ onDeleteAccount }: Props) {
  const { session, signOut } = useAuth();
  const [unit, setUnit] = useState<WeightUnit>("kg");

  useEffect(() => {
    void getUnitPref().then(setUnit);
  }, []);

  const pickUnit = (next: WeightUnit) => {
    if (next === unit) return;
    selectionHaptic();
    setUnit(next);
    void setUnitPref(next);
  };

  const email = session?.email ?? "";

  return (
    <View style={styles.flex}>
      <RiseIn index={0}>
        <Text style={styles.title}>Profile</Text>
      </RiseIn>

      <RiseIn index={1}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(session?.fullName ?? null, email)}</Text>
          </View>
          <View>
            {session?.fullName ? <Text style={styles.name}>{session.fullName}</Text> : null}
            <Text style={[styles.email, !session?.fullName && styles.emailOnly]}>{email}</Text>
          </View>
        </View>
      </RiseIn>

      <RiseIn index={2}>
        <View style={styles.group}>
          <Text style={styles.groupLabel}>PREFERENCES</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Units</Text>
              <View style={styles.unitToggle}>
                {(["kg", "lb"] as const).map((u) => {
                  const on = unit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => pickUnit(u)}
                      style={[
                        styles.unitCell,
                        u === "kg" ? styles.unitCellLeft : styles.unitCellRight,
                        on && styles.unitCellOn,
                        u === "lb" && !on && styles.unitCellNoLeft,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.unitText, on && styles.unitTextOn]}>{u}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Reminders</Text>
              <View style={styles.rowValueWrap}>
                <Text style={styles.rowValue}>Off</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </View>
          </View>
        </View>
      </RiseIn>

      <RiseIn index={3}>
        <View style={styles.group}>
          <Text style={styles.groupLabel}>ACCOUNT</Text>
          <View style={styles.card}>
            <Pressable style={styles.row} onPress={() => void signOut()} accessibilityRole="button">
              <Text style={styles.rowLabel}>Sign out</Text>
            </Pressable>
            <View style={styles.separator} />
            <Pressable style={styles.row} onPress={onDeleteAccount} accessibilityRole="button">
              <Text style={styles.rowDanger}>Delete account</Text>
            </Pressable>
          </View>
        </View>
      </RiseIn>

      <View style={styles.flex} />
      <Text style={styles.version}>Pulse {Constants.expoConfig?.version ?? "0.1.0"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  title: {
    ...type.greeting,
    color: color.text,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: size.chooserIconGap,
    marginTop: size.daySectionGap,
  },
  avatar: {
    width: size.avatar,
    height: size.avatar,
    borderRadius: size.avatar / 2,
    backgroundColor: color.inset,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...type.avatarInitials,
    color: color.textStrong,
  },
  name: {
    ...type.identityName,
    color: color.text,
  },
  email: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: space.xxs,
  },
  emailOnly: {
    marginTop: 0,
  },
  group: {
    marginTop: space.lg,
  },
  groupLabel: {
    ...type.sectionLabel,
    color: color.textFaint,
  },
  card: {
    marginTop: size.hintGap,
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    overflow: "hidden",
  },
  row: {
    height: size.settingsRow,
    paddingHorizontal: space.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  separator: {
    height: 1,
    backgroundColor: color.hairline,
    marginLeft: space.base,
  },
  rowLabel: {
    ...type.settingsLabel,
    color: color.text,
  },
  rowDanger: {
    ...type.settingsLabel,
    color: color.error,
  },
  rowValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  rowValue: {
    ...type.settingsLabel,
    color: color.textTertiary,
  },
  chevron: {
    fontSize: 18,
    lineHeight: 18,
    color: color.textPlaceholder,
  },
  unitToggle: {
    flexDirection: "row",
  },
  unitCell: {
    width: size.unitCellW,
    height: size.unitCellH,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.inset,
    borderWidth: 1,
    borderColor: color.fieldBorder,
  },
  unitCellLeft: {
    borderTopLeftRadius: radius.segment,
    borderBottomLeftRadius: radius.segment,
    zIndex: 1,
  },
  unitCellRight: {
    borderTopRightRadius: radius.segment,
    borderBottomRightRadius: radius.segment,
  },
  unitCellNoLeft: {
    borderLeftWidth: 0,
  },
  unitCellOn: {
    backgroundColor: color.emojiSelectedBg,
    borderColor: color.emojiSelectedBorder,
  },
  unitText: {
    ...type.caption,
    color: color.textTertiary,
  },
  unitTextOn: {
    color: color.text,
  },
  version: {
    ...type.captionSm,
    color: color.textGhost,
    textAlign: "center",
    paddingBottom: space.base,
  },
});
