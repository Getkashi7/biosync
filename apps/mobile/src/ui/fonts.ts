/**
 * Loads Space Grotesk (400/500/600/700) — the app's only typeface.
 * Returns whether fonts are ready so the root layout can hold the splash.
 */
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  return loaded;
}
