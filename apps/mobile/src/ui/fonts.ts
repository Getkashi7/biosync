/**
 * Loads the BIOSYNC typefaces: Onest (UI — SF-like, warm numerals) at
 * 300/400/500/600/700/800, and Doto (dotted 7-segment readouts) at 700/800.
 * Returns whether fonts are ready so the root layout can hold the splash.
 */
import {
  useFonts,
  Onest_300Light,
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  Onest_800ExtraBold,
} from "@expo-google-fonts/onest";
import { Doto_700Bold, Doto_800ExtraBold } from "@expo-google-fonts/doto";

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Onest_300Light,
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Onest_800ExtraBold,
    Doto_700Bold,
    Doto_800ExtraBold,
  });
  return loaded;
}
