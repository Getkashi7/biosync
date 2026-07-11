import { Redirect } from "expo-router";
import { useAuth } from "../src/features/auth/AuthProvider";

/** Cold-start entry: route to the app or the auth flow based on the restored session. */
export default function Index() {
  const { session, initializing } = useAuth();
  if (initializing) return null;
  return <Redirect href={session ? "/(app)/home" : "/(auth)/welcome"} />;
}
