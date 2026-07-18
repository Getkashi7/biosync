/**
 * Server environment. Read lazily so importing modules (e.g. in tests) never
 * requires secrets — only starting the server does (assertServerEnv).
 */
// Load apps/api/.env for the runtime (Prisma CLI loads it itself; tsx doesn't).
try {
  process.loadEnvFile();
} catch {
  // No .env present (e.g. CI/tests) — fall back to the process environment.
}

export const env = {
  /** Project base URL — used to fetch the JWKS for asymmetric (ES256) tokens. */
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  /** Legacy HS256 JWT secret — used only for HS256-signed tokens. */
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? "",
  /** Anthropic API key for the AI Coach. Optional — the chat degrades gracefully
   *  to a "not configured yet" reply when it's absent, so the app runs without it. */
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  PORT: Number(process.env.PORT ?? 4000),
};

export function assertServerEnv(): void {
  if (!env.SUPABASE_URL && !env.SUPABASE_JWT_SECRET) {
    throw new Error(
      "Set SUPABASE_URL (asymmetric JWKS verification) and/or SUPABASE_JWT_SECRET (legacy HS256) to start the Pulse API.",
    );
  }
}
