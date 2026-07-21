/**
 * Staff capability is what opens the professional surface — not `User.role`.
 *
 * The context only ever loads VERIFIED profiles (see `resolveUser`), so these
 * assert the boundary from the consumer's side: an account with no capability
 * is refused, and an account with one is not. PENDING/SUSPENDED are covered by
 * construction — they never reach the context, so they behave exactly like
 * "no capability", which is the case tested here.
 *
 * No database is touched: the middleware decides before any resolver runs.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import { ctx } from "./testContext";

const CLIENT = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("staff capability gate", () => {
  it("refuses an account with no capability, whatever its role", async () => {
    for (const role of ["USER", "ADMIN", "PT", "PRACTITIONER"] as const) {
      const caller = appRouter.createCaller(ctx({ id: "u1", role }));
      await expect(caller.staff.clients()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("admits an account holding a verified capability", async () => {
    const caller = appRouter.createCaller(ctx({ id: "s1", role: "USER", staff: ["PT"] }));
    // past the gate: fails on input validation, not authorization
    await expect(caller.staff.client({ clientId: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("admits a practitioner capability too", async () => {
    const caller = appRouter.createCaller(ctx({ id: "s2", role: "USER", staff: ["PRACTITIONER"] }));
    await expect(caller.staff.client({ clientId: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("lets one account hold both capacities", async () => {
    const caller = appRouter.createCaller(ctx({ id: "s3", role: "USER", staff: ["PT", "PRACTITIONER"] }));
    await expect(caller.staff.client({ clientId: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("does not let staff capability reach the consumer surface's owner check", async () => {
    // consumer routes are role- and capability-agnostic: they scope to ctx.user.id
    const caller = appRouter.createCaller(ctx({ id: "s1", role: "USER", staff: ["PT"] }));
    await expect(caller.me()).resolves.toMatchObject({ id: "s1", staff: [{ kind: "PT" }] });
  });
});

describe("granting capability", () => {
  it("is admin-only", async () => {
    const user = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(user.admin.grantStaff({ userId: CLIENT, kind: "PT" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(user.admin.revokeStaff({ userId: CLIENT, kind: "PT" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(user.admin.listStaff()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is not reachable by a staff member — capability can't grant itself", async () => {
    const staff = appRouter.createCaller(ctx({ id: "s1", role: "USER", staff: ["PRACTITIONER"] }));
    await expect(staff.admin.grantStaff({ userId: CLIENT, kind: "PT" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("requires a session at all", async () => {
    const anon = appRouter.createCaller(ctx(null));
    await expect(anon.admin.grantStaff({ userId: CLIENT, kind: "PT" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("validates its input", async () => {
    const admin = appRouter.createCaller(ctx({ id: "a1", role: "ADMIN" }));
    await expect(admin.admin.grantStaff({ userId: "nope", kind: "PT" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // @ts-expect-error — kind must be a staff capacity, not any Role
    await expect(admin.admin.grantStaff({ userId: CLIENT, kind: "ADMIN" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
