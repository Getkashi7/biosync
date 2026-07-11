/**
 * Auth state + actions for the whole app, backed by Supabase.
 *
 * - Restores the persisted session on cold start (`initializing` gates routing).
 * - Subscribes to onAuthStateChange so login/logout propagate app-wide.
 * - Pauses/resumes token auto-refresh with app foreground/background.
 *
 * The context shape is identical to the Step-2 mock; screens are unchanged.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export type AuthSession = { userId: string; email: string; accessToken: string };

export type AuthContextValue = {
  session: AuthSession | null;
  /** true until the persisted session has been restored on cold start */
  initializing: boolean;
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<void>;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const WRONG_CREDENTIALS_MESSAGE = "That email and password don’t match. Try again.";
const CONFIRM_EMAIL_MESSAGE = "Check your inbox to confirm your email, then log in.";

function toSession(session: Session | null): AuthSession | null {
  if (!session) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    accessToken: session.access_token,
  };
}

// Keep tokens fresh only while the app is foregrounded.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(toSession(data.session));
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(toSession(next));
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async ({ fullName, email, password }: { fullName: string; email: string; password: string }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw new Error(error.message);
    // When email confirmation is enabled Supabase returns a user but no session.
    if (!data.session) throw new Error(CONFIRM_EMAIL_MESSAGE);
  }, []);

  const signIn = useCallback(async ({ email, password }: { email: string; password: string }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Map Supabase's generic credential error to the design's copy.
      if (error.status === 400 || /invalid login credentials/i.test(error.message)) {
        throw new Error(WRONG_CREDENTIALS_MESSAGE);
      }
      throw new Error(error.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, initializing, signUp, signIn, signOut }),
    [session, initializing, signUp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
