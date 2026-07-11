/**
 * Thin wrapper over expo-haptics keyed to the design's haptic tokens.
 * Fire-and-forget; never throws on platforms without a haptic engine.
 */
import * as Haptics from "expo-haptics";

export function pressHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function errorHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

export function selectionHaptic() {
  Haptics.selectionAsync().catch(() => {});
}
