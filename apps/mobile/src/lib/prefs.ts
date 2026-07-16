/**
 * Local user preferences, persisted in AsyncStorage. Currently just the weight
 * unit: the Profile toggle writes it, and the logging sheets read it as their
 * initial kg/lb selection.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const UNIT_KEY = "pulse.unitPref";

export type WeightUnit = "kg" | "lb";

export async function getUnitPref(): Promise<WeightUnit> {
  try {
    const stored = await AsyncStorage.getItem(UNIT_KEY);
    return stored === "lb" ? "lb" : "kg";
  } catch {
    return "kg";
  }
}

export async function setUnitPref(unit: WeightUnit): Promise<void> {
  try {
    await AsyncStorage.setItem(UNIT_KEY, unit);
  } catch {
    // best-effort — the toggle still works for the session
  }
}
