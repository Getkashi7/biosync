/**
 * The Groq client's failure reasons.
 *
 * These exist because collapsing every failure to null hid a rejected API key
 * for a long time: the app told users "couldn't reach the coach", blaming the
 * network for a configuration error, and logged nothing. What matters to a
 * user is permanence — a rejected key never comes right by retrying.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { groqChat, __resetGroqWarning } from "../lib/groq";

const OLD_KEY = process.env.GROQ_API_KEY;
const MSG = [{ role: "user" as const, content: "hi" }];

beforeEach(() => {
  __resetGroqWarning();
  process.env.GROQ_API_KEY = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (OLD_KEY === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = OLD_KEY;
});

function reply(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("groqChat failure reasons", () => {
  it("distinguishes a rejected key from a transient failure", async () => {
    vi.stubGlobal("fetch", reply(401, {}));
    expect(await groqChat(MSG)).toEqual({ ok: false, reason: "rejected" });

    vi.stubGlobal("fetch", reply(503, {}));
    expect(await groqChat(MSG)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("treats 403 as rejected too — also ours to fix", async () => {
    vi.stubGlobal("fetch", reply(403, {}));
    expect(await groqChat(MSG)).toEqual({ ok: false, reason: "rejected" });
  });

  it("reports rate limiting separately, since that one is worth retrying", async () => {
    vi.stubGlobal("fetch", reply(429, {}));
    expect(await groqChat(MSG)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("never throws on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    expect(await groqChat(MSG)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("treats an empty completion as unavailable, not as content", async () => {
    vi.stubGlobal("fetch", reply(200, { choices: [{ message: { content: "   " } }] }));
    expect(await groqChat(MSG)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns trimmed content on success", async () => {
    vi.stubGlobal("fetch", reply(200, { choices: [{ message: { content: "  hello  " } }] }));
    expect(await groqChat(MSG)).toEqual({ ok: true, content: "hello" });
  });

  // The `unconfigured` branch isn't covered here on purpose: `env` snapshots
  // process.env at import, so unsetting the key mid-test does nothing, and
  // mocking the env module to reach one early return costs more fragility than
  // the branch is worth. `hasGroqKey()` guards the same condition at each call
  // site and is exercised through the routers.

  // A bad key fails on every single request; logging each one would bury the
  // signal in noise.
  it("logs a rejected key once, not on every call", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", reply(401, {}));
    await groqChat(MSG);
    await groqChat(MSG);
    await groqChat(MSG);
    expect(err).toHaveBeenCalledTimes(1);
    // And never the key itself.
    expect(String(err.mock.calls[0]?.[0])).not.toContain("test-key");
  });
});
