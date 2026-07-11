import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/features/auth/AuthProvider";
import { useAppFonts } from "../src/ui/fonts";
import { color } from "../src/ui/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Redirects reactively when the session appears (post-login) or clears (post-signout). */
function useProtectedRoute() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inApp = segments[0] === "(app)";
    const inAuth = segments[0] === "(auth)";
    if (session && inAuth) {
      router.replace("/(app)/home");
    } else if (!session && inApp) {
      router.replace("/(auth)/welcome");
    }
  }, [session, initializing, segments, router]);
}

function RootNavigator() {
  useProtectedRoute();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" options={{ animation: "fade" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const fontsLoaded = useAppFonts();

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
