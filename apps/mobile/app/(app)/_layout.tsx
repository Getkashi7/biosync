import { Stack } from "expo-router";
import { color } from "../../src/ui/theme";

/** Authenticated area: fade-through entry from the auth flow. */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        contentStyle: { backgroundColor: color.bg },
      }}
    />
  );
}
