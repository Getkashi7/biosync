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
  /** Groq API key for the AI Coach (free tier). Optional — the chat degrades
   *  gracefully to a "not configured yet" reply when absent, so the app runs without it. */
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
  PORT: Number(process.env.PORT ?? 4000),
  /** Bind address. Containers must listen on 0.0.0.0, not loopback, to be reachable. */
  HOST: process.env.HOST ?? "0.0.0.0",
  /** "production" tightens CORS and quiets error detail. */
  NODE_ENV: process.env.NODE_ENV ?? "development",
  /**
   * Comma-separated browser origins allowed to call the API (Expo web, the
   * marketing/legal site). Native clients send no Origin header and are never
   * affected by this. Empty = allow any origin, which is the dev default.
   */
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "",
};

/** Parsed allowlist; empty array means "no restriction". */
export const allowedOrigins: string[] = env.ALLOWED_ORIGINS.split(",")
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

export const isProduction = env.NODE_ENV === "production";

export function assertServerEnv(): void {
  if (!env.SUPABASE_URL && !env.SUPABASE_JWT_SECRET) {
    throw new Error(
      "Set SUPABASE_URL (asymmetric JWKS verification) and/or SUPABASE_JWT_SECRET (legacy HS256) to start the Pulse API.",
    );
  }
  // Prisma would fail later with a less obvious message; fail at boot instead.
  if (!process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL to start the Pulse API.");
  }
}
