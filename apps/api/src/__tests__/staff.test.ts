/**
 * Staff authorization.
 *
 * Access is granted by a VERIFIED staff capability, NOT by `User.role` — so a
 * role of "PT" alone must not open the surface, and only a capability does.
 * These stop before any DB call, so they run without a database.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import { ctx } from "./testContext";

const CLIENT = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("staff authorization", () => {
  it("no token → UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.staff.clients()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.staff.client({ clientId: CLIENT })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a regular USER is FORBIDDEN from the staff surface", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(caller.staff.clients()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.staff.client({ clientId: CLIENT })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an ADMIN is not automatically a care provider", async () => {
    // admin manages the platform; reading a client's record needs a care link
    const caller = appRouter.createCaller(ctx({ id: "a1", role: "ADMIN" }));
    await expect(caller.staff.clients()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a PT *role* alone does not open the surface — capability does", async () => {
    // the account is labelled PT but holds no verified staff profile
    const caller = appRouter.createCaller(ctx({ id: "s1", role: "PT" }));
    await expect(caller.staff.clients()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a verified capability opens the surface, whatever the platform role", async () => {
    // gets past authz and fails later (no DB here) — not FORBIDDEN
    const caller = appRouter.createCaller(ctx({ id: "s1", role: "USER", staff: ["PT"] }));
    await expect(caller.staff.client({ clientId: "nope" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a non-uuid client id", async () => {
    const caller = appRouter.createCaller(ctx({ id: "s1", role: "USER", staff: ["PT"] }));
    await expect(caller.staff.client({ clientId: "nope" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
