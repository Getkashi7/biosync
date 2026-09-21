/**
 * You — built to the N2 handoff.
 *
 * The point of this screen is what it no longer holds. It was seven section
 * headers and up to fifteen rows in glass cards, under an 84pt breathing avatar
 * and two stat pills; it is now one identity row and three flat sections. Where
 * the rest went, so nothing is lost:
 *
 * - Training and Gym → the Train tab.
 * - Coach plan and Journal → Home, where the day's actions live.
 * - Units and Notifications → one **Preferences** row.
 * - From your trainer → inside My care team, with the people who wrote it.
 * - Privacy policy → the foot of Who sees what.
 * - Trainer and Admin → one **Switch to…** row that names where it goes.
 * - The streak and readiness pills → Home, where the numbers are the point.
 *
 * The handoff draws it fitting 390×844 without scrolling. The S23 is shorter
 * than that, so it still sits in a ScrollView — one that simply does not move
 * on a phone tall enough, rather than clipping Delete account on one that isn't.
 */
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlatRow, FlatSection } from "../../ui/bio/FlatRow";
import { RadialBloom } from "../../ui/bio/RadialBloom";
import { bio } from "../../ui/theme";
import { useAuth } from "../auth/AuthProvider";

const f = bio.flat;

function initialsOf(fullName: string | null, email: string): string {
  const words = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  if (words.length === 1 && words[0]!.length > 0) return words[0]![0]!.toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

/** A place this account can switch into, named as the row's value. */
export type SwitchTarget = { label: string; go: () => void };

type Props = {
  onTreatments: () => void;
  onPhotos: () => void;
  onCareTeam: () => void;
  onPreferences: () => void;
  onConsent: () => void;
  /** Staff and admin destinations this account actually holds. Empty for members. */
  switchTo: SwitchTarget[];
  onExportData: () => void;
  onDeleteAccount: () => void;
};

export function ProfileScreen({
  onTreatments,
  onPhotos,
  onCareTeam,
  onPreferences,
  onConsent,
  switchTo,
  onExportData,
  onDeleteAccount,
}: Props) {
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const email = session?.email ?? "";
  const name = session?.fullName?.trim() || null;

  const onSwitch = () => {
    // One destination goes straight there. Two (staff *and* admin) is the only
    // case that needs a choice, and a native sheet is enough for it.
    if (switchTo.length === 1) return switchTo[0]!.go();
    Alert.alert("Switch to", undefined, [
      ...switchTo.map((t) => ({ text: t.label, onPress: t.go })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  return (
    <View style={styles.root}>
      <RadialBloom
        color={bio.color.violet}
        size={f.bloom.size}
        left={f.bloom.left}
        top={f.bloom.top}
        alpha={f.bloom.alpha}
      />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>You</Text>

        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initialsOf(name, email)}</Text>
          </View>
          <View style={styles.flexMin}>
            {name ? (
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
            ) : null}
            <Text style={styles.email} numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>
        <View style={styles.rule} />

        <FlatSection label="Health">
          <FlatRow label="Treatments" onPress={onTreatments} />
          <FlatRow label="Progress photos" onPress={onPhotos} />
          <FlatRow label="My care team" onPress={onCareTeam} />
        </FlatSection>

        <FlatSection label="Settings">
          <FlatRow label="Preferences" onPress={onPreferences} />
          <FlatRow label="Who sees what" onPress={onConsent} />
          {switchTo.length > 0 ? (
            <FlatRow
              label="Switch to…"
              value={switchTo.map((t) => t.label).join(" · ")}
              onPress={onSwitch}
            />
          ) : null}
        </FlatSection>

        <FlatSection label="Account">
          <FlatRow label="Download your data" onPress={onExportData} />
          <FlatRow label="Sign out" onPress={() => void signOut()} />
          <FlatRow label="Delete account" onPress={onDeleteAccount} danger />
        </FlatSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bio.color.page },
  flexMin: { flex: 1, minWidth: 0 },
  title: { ...f.title, color: bio.color.white, paddingHorizontal: f.gutter },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingHorizontal: f.gutter,
    paddingVertical: 14,
  },
  avatar: {
    width: f.avatar,
    height: f.avatar,
    borderRadius: f.avatar / 2,
    backgroundColor: bio.violetAlpha(0.14),
    borderWidth: 1,
    borderColor: bio.violetAlpha(0.3),
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { ...f.initials, color: bio.color.violet },
  name: { ...f.name, color: bio.color.white },
  email: { ...f.email, color: bio.alpha(0.45), marginTop: 3 },
  rule: {
    marginHorizontal: f.gutter,
    borderTopWidth: 1,
    borderTopColor: bio.color.hairline,
  },
});
