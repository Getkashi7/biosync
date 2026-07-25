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
 * Release builds (preview/production) must talk to the deployed API, so an
 * explicit EXPO_PUBLIC_API_URL wins outright there — a shipped app has no Metro
 * host and must never quietly fall back to localhost, which would look like
 * "the app is broken" rather than "the URL is missing".
 *
 * In dev the app runs in a dev client and this machine's LAN IP shifts whenever
 * DHCP reassigns its lease — so rather than hard-code an IP we reuse the host
 * Metro served the bundle from (`Constants.expoConfig.hostUri`, e.g.
 * "192.168.1.9:8081", or "localhost" over the USB reverse tunnel) and point it
 * at the API port.
 */
function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (!__DEV__) {
    if (explicit) return explicit;
    // Misconfigured release build: say so loudly rather than fail as a hang.
    console.error("EXPO_PUBLIC_API_URL is not set — this build cannot reach the API.");
  }

  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:${API_PORT}`;
  return explicit ?? `http://localhost:${API_PORT}`;
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
