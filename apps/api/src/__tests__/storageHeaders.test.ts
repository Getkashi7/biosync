/**
 * The rule: a storage request with no body must not claim a content type.
 *
 * This is a regression guard for a bug that broke photo upload AND photo
 * deletion from the day they were written, on every environment, and hid for
 * weeks behind a plausible-looking wrong answer. `storageHeaders()` set
 * `Content-Type: application/json` on every call, including the two that send
 * nothing, and Supabase's Fastify layer rejects that outright:
 *
 *   400 "Body cannot be empty when content-type is set to 'application/json'"
 *
 * The request never reached the bucket, so the symptom looked like a storage or
 * credential problem. It cost a wrong diagnosis: `/health/config` reported the
 * key present, which it was, and the real fault was a malformed request.
 *
 * Deletion was the worse half. The 400 was indistinguishable from a genuine
 * failure, so `photos.remove` kept the row and told the user to try again — a
 * loop with no exit, on a screen that promises the photo is gone for everyone.
 *
 * These tests drive every storage function against a fake `fetch` and assert
 * the invariant directly, so adding a new call with the wrong headers fails
 * here rather than in production months later.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const OLD = { ...process.env };

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

function fakeFetch(body: unknown = {}, ok = true, status = 200) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
}

beforeEach(() => {
  calls.length = 0;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
});

function headersOf(c: Call): Record<string, string> {
  return (c.init.headers ?? {}) as Record<string, string>;
}

/** The invariant, stated once. */
function assertBodyMatchesContentType(c: Call): void {
  const declaresJson = Object.entries(headersOf(c)).some(
    ([k, v]) => k.toLowerCase() === "content-type" && String(v).includes("application/json"),
  );
  const hasBody = c.init.body !== undefined && c.init.body !== null;
  expect(
    declaresJson && !hasBody,
    `${c.init.method ?? "GET"} ${c.url} declares application/json but sends no body — ` +
      "Supabase answers 400 and the request never reaches the bucket",
  ).toBe(false);
}

describe("every storage call sends a body if it claims to", () => {
  it("holds for signing an upload URL", async () => {
    vi.stubGlobal("fetch", fakeFetch({ url: "/object/x", token: "t" }));
    const { createSignedUploadUrl } = await import("../lib/storage");
    await createSignedUploadUrl("user/photo.jpg");
    expect(calls).toHaveLength(1);
    calls.forEach(assertBodyMatchesContentType);
  });

  it("holds for deleting one object", async () => {
    vi.stubGlobal("fetch", fakeFetch({}));
    const { deleteObject } = await import("../lib/storage");
    await deleteObject("user/photo.jpg");
    expect(calls).toHaveLength(1);
    calls.forEach(assertBodyMatchesContentType);
  });

  it("holds for signing a read URL, which does send a body", async () => {
    vi.stubGlobal("fetch", fakeFetch({ signedURL: "/object/sign/x" }));
    const { createSignedReadUrl } = await import("../lib/storage");
    await createSignedReadUrl("user/photo.jpg");
    calls.forEach(assertBodyMatchesContentType);
    // …and it must still declare the type, because it does carry JSON.
    expect(headersOf(calls[0]!)["Content-Type"]).toBe("application/json");
  });

  it("holds for the account-erasure purge, across list and delete", async () => {
    vi.stubGlobal("fetch", fakeFetch([{ name: "a.jpg" }]));
    const { deleteAllUserObjects } = await import("../lib/storage");
    await deleteAllUserObjects("11111111-2222-3333-4444-555555555555");
    expect(calls.length).toBeGreaterThan(1);
    calls.forEach(assertBodyMatchesContentType);
  });

  it("holds for the storage probe", async () => {
    vi.stubGlobal("fetch", fakeFetch({ url: "/x", token: "t" }));
    const { probeStorage } = await import("../lib/storage");
    await probeStorage();
    expect(calls).toHaveLength(1);
    calls.forEach(assertBodyMatchesContentType);
  });
});

describe("credentials", () => {
  it("authenticates every call, body or not", async () => {
    vi.stubGlobal("fetch", fakeFetch({ url: "/x", token: "t" }));
    const { createSignedUploadUrl, deleteObject } = await import("../lib/storage");
    await createSignedUploadUrl("user/photo.jpg");
    await deleteObject("user/photo.jpg");
    for (const c of calls) {
      const h = headersOf(c);
      expect(h.apikey, `${c.url} sent no apikey`).toBeTruthy();
      expect(h.Authorization, `${c.url} sent no Authorization`).toContain("Bearer ");
    }
  });
});

describe("probeStorage", () => {
  it("says 'not configured' without reaching the network", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    vi.resetModules();
    const f = fakeFetch({});
    vi.stubGlobal("fetch", f);
    const { probeStorage } = await import("../lib/storage");
    expect(await probeStorage()).toEqual({ ok: false, status: 0, reason: "not configured" });
    expect(f).not.toHaveBeenCalled();
  });

  it("reports the upstream status when the bucket refuses", async () => {
    vi.stubGlobal("fetch", fakeFetch({ error: "denied" }, false, 401));
    const { probeStorage } = await import("../lib/storage");
    const r = await probeStorage();
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  // The whole point of the probe: it must never echo the credential back out,
  // since it answers unauthenticated callers.
  it("never returns the key", async () => {
    vi.stubGlobal("fetch", fakeFetch({ error: "denied" }, false, 403));
    const { probeStorage } = await import("../lib/storage");
    expect(JSON.stringify(await probeStorage())).not.toContain("service-key");
  });
});
