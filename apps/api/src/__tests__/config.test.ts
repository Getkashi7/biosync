/**
 * What this deploy says it can do.
 *
 * These exist because photo upload shipped broken and stayed broken for weeks.
 * `SUPABASE_SERVICE_ROLE_KEY` was declared in `render.yaml` with `sync: false`,
 * never filled in on the dashboard, and nothing anywhere said so — not at boot,
 * not over HTTP, and not in the error the user got when they tapped "add
 * photo". The only symptom was an opaque failure at the moment of use.
 *
 * So the rule these pin down: a missing optional credential must be **loud and
 * inspectable**, and must never be fatal. An API that refuses to start because
 * photos aren't configured is a worse outage than the one it prevents.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const OLD = { ...process.env };

afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Re-import `env` with a given process environment, bypassing module cache. */
async function withEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("../env");
}

describe("featureConfig", () => {
  it("reports photo storage off when the service-role key is missing", async () => {
    const { featureConfig } = await withEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "",
    });
    const cfg = featureConfig();
    expect(cfg.photoStorage).toBe(false);
    // Same key, so erasure loses the ability to purge stored images too. That
    // is a GDPR-relevant consequence and must not be reported separately-true.
    expect(cfg.accountErasure).toBe(false);
  });

  it("reports photo storage off when the project URL is missing", async () => {
    const { featureConfig } = await withEnv({
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
    });
    expect((await Promise.resolve(featureConfig())).photoStorage).toBe(false);
  });

  it("reports everything on when all of it is set", async () => {
    const { featureConfig } = await withEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      GROQ_API_KEY: "groq-key",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    expect(featureConfig()).toEqual({
      photoStorage: true,
      aiCoach: true,
      accountErasure: true,
      payments: true,
    });
  });

  it("tracks the coach separately from storage", async () => {
    const { featureConfig } = await withEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      GROQ_API_KEY: "",
    });
    const cfg = featureConfig();
    expect(cfg.aiCoach).toBe(false);
    expect(cfg.photoStorage).toBe(true);
  });
});

describe("reportFeatureConfig", () => {
  it("says nothing when the deploy is fully configured", async () => {
    const { reportFeatureConfig } = await withEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      GROQ_API_KEY: "groq-key",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    const log = vi.fn();
    reportFeatureConfig(log);
    expect(log).not.toHaveBeenCalled();
  });

  /**
   * Named per feature, not per variable: "SUPABASE_SERVICE_ROLE_KEY is unset"
   * means nothing to whoever is reading a deploy log; "progress photos will
   * fail to upload" is the sentence that makes someone act.
   */
  it("names the user-visible consequence, and the variable to set", async () => {
    const { reportFeatureConfig } = await withEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "",
      GROQ_API_KEY: "groq-key",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    const log = vi.fn();
    reportFeatureConfig(log);

    expect(log).toHaveBeenCalledTimes(1);
    const msg = String(log.mock.calls[0]?.[0]);
    expect(msg).toContain("progress photos will fail to upload");
    expect(msg).toContain("account deletion");
    expect(msg).toContain("SUPABASE_SERVICE_ROLE_KEY");
    // The coach is fine here and must not be blamed.
    expect(msg).not.toContain("GROQ_API_KEY");
  });

  it("never prints a credential, only its name", async () => {
    const secret = "super-secret-service-role-value";
    const { reportFeatureConfig } = await withEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: secret,
      GROQ_API_KEY: "",
    });
    const log = vi.fn();
    reportFeatureConfig(log);
    expect(String(log.mock.calls[0]?.[0] ?? "")).not.toContain(secret);
  });
});

describe("assertServerEnv", () => {
  // The whole point: missing photo storage must not take the API down.
  it("still starts with no storage key at all", async () => {
    const { assertServerEnv } = await withEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_JWT_SECRET: "secret",
      SUPABASE_SERVICE_ROLE_KEY: "",
      DATABASE_URL: "postgresql://localhost:5432/x",
    });
    expect(() => assertServerEnv()).not.toThrow();
  });

  it("still refuses to start with no way to verify a token", async () => {
    const { assertServerEnv } = await withEnv({
      SUPABASE_URL: "",
      SUPABASE_JWT_SECRET: "",
      DATABASE_URL: "postgresql://localhost:5432/x",
    });
    expect(() => assertServerEnv()).toThrow(/SUPABASE_URL/);
  });
});
