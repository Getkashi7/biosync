/**
 * Account export + deletion. Both are authorization-critical: one hands over
 * everything an account holds, the other destroys it, and neither may ever
 * take an owner from input.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import { ctx } from "./testContext";

describe("account authorization", () => {
  const anon = appRouter.createCaller(ctx(null));

  it("no token → UNAUTHORIZED on exportData", async () => {
    await expect(anon.account.exportData()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("no token → UNAUTHORIZED on deleteAccount", async () => {
    await expect(anon.account.deleteAccount()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  // Neither procedure takes an owner from input — the user comes from the
  // verified JWT. Passing one anyway must not get a caller past the auth
  // middleware, which is the only way it could ever reach someone else's data.
  it("a forged owner in the payload does not bypass auth", async () => {
    const forged = { userId: "someone-else" } as never;
    await expect(anon.account.exportData(forged)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.account.deleteAccount(forged)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
