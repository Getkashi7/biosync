/**
 * The free-tier wake-up. What matters is that it never becomes a problem of
 * its own: it must not throw, must not stampede, and must not claim the server
 * is cold when it hasn't been asked yet.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { warmApi, isLikelyCold, apiIsAwake, __resetWarmup } from "../warmup";

const OLD_URL = process.env.EXPO_PUBLIC_API_URL;

beforeEach(() => {
  __resetWarmup();
  process.env.EXPO_PUBLIC_API_URL = "https://example.test";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (OLD_URL === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = OLD_URL;
});

describe("warmApi", () => {
  it("marks the API awake once health answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await warmApi();
    expect(apiIsAwake()).toBe(true);
  });

  // Failing to warm is not an error the user needs to see; the screens report
  // their own failures honestly.
  it("never rejects when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network request failed")));
    await expect(warmApi()).resolves.toBeUndefined();
    expect(apiIsAwake()).toBe(false);
  });

  it("does not mark awake on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await warmApi();
    expect(apiIsAwake()).toBe(false);
  });

  it("joins an in-flight warm-up rather than stampeding", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([warmApi(), warmApi(), warmApi()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips entirely when no API URL is configured", async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await warmApi();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isLikelyCold", () => {
  it("is false before anything has been asked", () => {
    expect(isLikelyCold()).toBe(false);
  });

  it("is false once the API has answered", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await warmApi();
    expect(isLikelyCold(0)).toBe(false);
  });

  it("reports cold while a warm-up is outstanding past the threshold", () => {
    // A request that never settles — the cold-start case.
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    void warmApi();
    expect(isLikelyCold(-1)).toBe(true);
  });
});
