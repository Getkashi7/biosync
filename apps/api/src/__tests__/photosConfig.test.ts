/**
 * "Not switched on" is a different answer from "it broke".
 *
 * A deploy with no storage credentials can never sign an upload URL, so telling
 * the user "something went wrong, try again" invites them to retry a thing that
 * fails every single time — which is exactly what happened for weeks, and is
 * the same mistake the Groq client used to make before it learned to say
 * `unconfigured`.
 *
 * Storage is mocked here rather than read from the environment, so the result
 * does not depend on whether the machine running the tests happens to have a
 * `.env` — CI has none, this laptop does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const storageConfigured = vi.fn();
const createSignedUploadUrl = vi.fn();

vi.mock("../lib/storage", () => ({
  storageConfigured: (...a: unknown[]) => storageConfigured(...a),
  createSignedUploadUrl: (...a: unknown[]) => createSignedUploadUrl(...a),
  createSignedReadUrl: async () => null,
  deleteObject: async () => true,
  extensionFor: () => "jpg",
}));

const { appRouter } = await import("../router");
const { ctx } = await import("./testContext");

const UPLOAD = {
  takenOn: "2026-09-11",
  mimeType: "image/jpeg" as const,
  byteSize: 2048,
  audienceOverride: null,
};

function caller() {
  return appRouter.createCaller(ctx({ id: "11111111-2222-3333-4444-555555555555", role: "USER" })).photos;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  storageConfigured.mockReturnValue(true);
  createSignedUploadUrl.mockResolvedValue({ signedUrl: "https://example/sign", token: "t" });
});

describe("createUploadUrl when storage is not configured", () => {
  it("refuses with PRECONDITION_FAILED, not a retryable server error", async () => {
    storageConfigured.mockReturnValue(false);
    await expect(caller().createUploadUrl(UPLOAD)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("does not even try to reach the bucket", async () => {
    storageConfigured.mockReturnValue(false);
    await expect(caller().createUploadUrl(UPLOAD)).rejects.toBeTruthy();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("says so in the server log, naming the variables to set", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    storageConfigured.mockReturnValue(false);
    await expect(caller().createUploadUrl(UPLOAD)).rejects.toBeTruthy();
    const msg = String(err.mock.calls[0]?.[0] ?? "");
    expect(msg).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("tells the user nothing was saved, without blaming their connection", async () => {
    storageConfigured.mockReturnValue(false);
    const rejected = await caller().createUploadUrl(UPLOAD).catch((e: Error) => e);
    const message = (rejected as Error).message.toLowerCase();
    expect(message).toContain("nothing was saved");
    expect(message).not.toContain("connection");
    expect(message).not.toContain("try again");
  });
});

describe("createUploadUrl when storage is configured but failing", () => {
  it("is an INTERNAL_SERVER_ERROR — transient, and worth retrying", async () => {
    createSignedUploadUrl.mockRejectedValue(new Error("Storage refused an upload URL (401)"));
    await expect(caller().createUploadUrl(UPLOAD)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("logs the reason, so a bad key is one log line rather than a bisect", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSignedUploadUrl.mockRejectedValue(new Error("Storage refused an upload URL (401)"));
    await expect(caller().createUploadUrl(UPLOAD)).rejects.toBeTruthy();
    expect(String(err.mock.calls[0]?.[0] ?? "")).toContain("401");
  });

  /**
   * The storage path begins with the owner's user id. CLAUDE.md keeps
   * identifiers of that kind out of logs for the same reason it keeps health
   * values out, and a log line written during an incident is exactly where
   * someone would be tempted to add it.
   */
  it("never logs the storage path", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSignedUploadUrl.mockRejectedValue(new Error("boom"));
    await expect(caller().createUploadUrl(UPLOAD)).rejects.toBeTruthy();
    const logged = err.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).not.toContain("11111111-2222-3333-4444-555555555555");
  });

  it("hands back a signed URL when everything works", async () => {
    const res = await caller().createUploadUrl(UPLOAD);
    expect(res.signedUrl).toBe("https://example/sign");
    expect(res.path.startsWith("11111111-2222-3333-4444-555555555555/")).toBe(true);
  });
});
