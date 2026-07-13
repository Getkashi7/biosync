/**
 * Typed tRPC client. The AppRouter type is imported type-only from the API
 * package (no runtime dependency). Each request carries the current Supabase
 * access token so the API can verify the JWT and resolve the user's role.
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import Constants from "expo-constants";
import type { AppRouter } from "@pulse/api";
import { supabase } from "./supabase";

/** Port the standalone API listens on (see apps/api env PORT). */
const API_PORT = 4000;

/**
 * Resolve the API base URL.
 *
 * In dev the app runs in Expo Go / a dev client, and this machine's LAN IP shifts
 * whenever DHCP reassigns its lease — so rather than hard-code an IP we reuse the
 * same host Metro served the bundle from (`Constants.expoConfig.hostUri`, e.g.
 * "192.168.1.9:8081") and point it at the API port. Web dev resolves to
 * "localhost". A production build has no Metro host, so it falls back to an
 * explicit EXPO_PUBLIC_API_URL.
 */
function resolveBaseUrl(): string {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:${API_PORT}`;
  return process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
}

const baseUrl = resolveBaseUrl();

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${baseUrl}/trpc`,
      async headers() {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
