import { Stack } from "expo-router";
import { color } from "../../src/ui/theme";

/** Auth flow: horizontal push/pop between Welcome, Sign Up, and Log In. */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: color.bg },
      }}
    />
  );
}
