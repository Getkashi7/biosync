/**
 * Typed tRPC client. The AppRouter type is imported type-only from the API
 * package (no runtime dependency). Each request carries the current Supabase
 * access token so the API can verify the JWT and resolve the user's role.
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@pulse/api";
import { supabase } from "./supabase";

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

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
