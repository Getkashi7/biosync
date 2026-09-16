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
  /** Service role key for admin operations (account deletion, etc.). */
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  /** Groq API key for the AI Coach (free tier). Optional — the chat degrades
   *  gracefully to a "not configured yet" reply when absent, so the app runs without it. */
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
  /** Stripe secret key. Optional — the admin revenue figures report
   *  themselves unavailable without it, and nothing else depends on it. */
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  PORT: Number(process.env.PORT) || 4000,
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
  .map((o: string) => o.trim())
  .filter((o: string) => o.length > 0);

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

/**
 * Which optional subsystems this deploy can actually serve.
 *
 * These are deliberately NOT fatal in `assertServerEnv`. A deploy missing the
 * storage key should still serve check-ins, nutrition and the coach — taking
 * the whole API down over one feature would be a worse outage than the one it
 * prevents. But it must not be *silent* either, which is exactly how photo
 * upload shipped broken: `SUPABASE_SERVICE_ROLE_KEY` was declared in
 * render.yaml, never filled in on the dashboard, and nothing said so until a
 * user tapped "add photo" weeks later and got an opaque error.
 *
 * So: booleans, reported at boot and over `/health/config`. Never the values.
 */
export type FeatureConfig = {
  /** Progress photos (§1) — needs the service-role key to sign bucket URLs. */
  photoStorage: boolean;
  /** AI coach, macro estimates, supplement suggestions. */
  aiCoach: boolean;
  /** Account deletion's storage purge — same key as photos. */
  accountErasure: boolean;
  /** Admin revenue figures. Named for the feature, not the vendor. */
  payments: boolean;
};

export function featureConfig(): FeatureConfig {
  const storage = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    photoStorage: storage,
    aiCoach: Boolean(env.GROQ_API_KEY),
    accountErasure: storage,
    payments: Boolean(env.STRIPE_SECRET_KEY),
  };
}

/**
 * Say at boot what this deploy cannot do, and what that costs the user.
 *
 * Named per feature rather than per variable, because "SUPABASE_SERVICE_ROLE_KEY
 * is unset" means nothing to whoever reads the deploy log at 2am; "progress
 * photos will fail to upload" does.
 */
export function reportFeatureConfig(log: (msg: string) => void = console.warn): void {
  const cfg = featureConfig();
  const broken: string[] = [];
  if (!cfg.photoStorage) {
    broken.push(
      "progress photos will fail to upload, and account deletion will not remove stored images " +
        "(set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  if (!cfg.aiCoach) {
    broken.push("the AI coach, macro estimates and supplement suggestions are off (set GROQ_API_KEY)");
  }
  if (!cfg.payments) {
    broken.push("the admin revenue figures will report themselves unavailable (set STRIPE_SECRET_KEY)");
  }
  if (broken.length === 0) return;
  log(`[config] this deploy is missing optional configuration:\n  - ${broken.join("\n  - ")}`);
}
