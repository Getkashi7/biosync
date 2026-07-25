import { describe, it, expect } from "vitest";
import { classifyNetError } from "../netError";

/** Shape of a TRPCClientError raised from an actual server response. */
function serverError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), {
    data: { code: "INTERNAL_SERVER_ERROR", httpStatus },
    shape: { message },
  });
}

/** Shape of a tRPC error wrapping a transport failure — nothing came back. */
function transportError(causeMessage: string) {
  return Object.assign(new Error("Failed to fetch"), {
    data: null,
    shape: null,
    cause: new TypeError(causeMessage),
  });
}

describe("classifyNetError", () => {
  it("treats a server response as an error, not a connectivity problem", () => {
    // The user's connection is demonstrably fine — the server answered.
    expect(classifyNetError(serverError("Internal server error", 500))).toBe("error");
    expect(classifyNetError(serverError("Bad request", 400))).toBe("error");
  });

  it("treats a 500 as an error even though the message sounds network-ish", () => {
    // `data` present wins over the message text.
    expect(classifyNetError(serverError("network timeout upstream", 500))).toBe("error");
  });

  it("recognises React Native's transport failure", () => {
    expect(classifyNetError(transportError("Network request failed"))).toBe("offline");
  });

  it("reads the cause chain, not just the top-level message", () => {
    expect(classifyNetError(transportError("Unable to resolve host \"api\""))).toBe("offline");
    expect(classifyNetError(transportError("Failed to connect to /10.0.0.1:4000"))).toBe("offline");
    expect(classifyNetError(transportError("Connection refused"))).toBe("offline");
  });

  it("is case-insensitive about the hint", () => {
    expect(classifyNetError(transportError("NETWORK REQUEST FAILED"))).toBe("offline");
  });

  it("treats a bare fetch TypeError as offline", () => {
    expect(classifyNetError(new TypeError("Network request failed"))).toBe("offline");
  });

  it("treats a timeout as offline", () => {
    expect(classifyNetError(new Error("The request timed out"))).toBe("offline");
  });

  it("falls back to offline when nothing identifies the failure", () => {
    // Nothing reached the server; "check your connection" is the more useful
    // guess because it points at something the user can act on.
    expect(classifyNetError(new Error("boom"))).toBe("offline");
    expect(classifyNetError(undefined)).toBe("offline");
    expect(classifyNetError(null)).toBe("offline");
    expect(classifyNetError("a string")).toBe("offline");
  });

  it("doesn't recurse forever on a self-referencing cause", () => {
    const e: { message: string; cause?: unknown } = { message: "loop" };
    e.cause = e;
    expect(() => classifyNetError(e)).not.toThrow();
  });
});
