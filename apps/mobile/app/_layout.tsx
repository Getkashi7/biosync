import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { warmApi } from "../src/lib/warmup";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/features/auth/AuthProvider";
import { useAppFonts } from "../src/ui/fonts";
import { configureNotifications, syncReminders } from "../src/lib/reminders";
import { color } from "../src/ui/theme";
import { AppErrorBoundary } from "../src/ui/AppErrorBoundary";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Start waking the API at the earliest possible moment — module scope, before
// any component mounts. The free tier sleeps when idle, and the cold start is
// long enough that the user should never be the one who triggers it: this
// overlaps the wake-up with fonts loading and the session resolving.
void warmApi();

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

  // Set the notification handler/channel once, then reconcile the scheduled
  // reminder with the stored prefs + check-in state on launch.
  useEffect(() => {
    void configureNotifications().then(() => syncReminders());
  }, []);

  if (!fontsLoaded) return null;

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
