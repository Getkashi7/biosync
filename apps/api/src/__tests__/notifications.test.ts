/**
 * Authorization + input validation for the notifications router, exercised
 * through createCaller with a hand-built context (no DB): every case here is
 * rejected by middleware or the Zod parser before any resolver touches Prisma.
 */
import { describe, it, expect } from "vitest";
import { defaultNotificationPrefs, notificationPrefsInput } from "@pulse/shared";
import { appRouter } from "../router";
import { ctx } from "./testContext";

const validPrefs = defaultNotificationPrefs();

describe("notifications authorization", () => {
  it("no token → UNAUTHORIZED on get", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.notifications.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("no token → UNAUTHORIZED on update", async () => {
    const caller = appRouter.createCaller(ctx(null));
    await expect(caller.notifications.update(validPrefs)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("notifications input validation", () => {
  const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));

  it("rejects a malformed quiet-hours time", async () => {
    await expect(
      caller.notifications.update({ ...validPrefs, quietStart: "25:00" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an unpadded time", async () => {
    await expect(
      caller.notifications.update({ ...validPrefs, quietEnd: "7:00" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a nudge type that has nothing behind it yet", async () => {
    await expect(
      caller.notifications.update({
        ...validPrefs,
        nudges: [{ type: "APPOINTMENTS", enabled: true, time: "09:00" }],
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // A toggle that is on but has no time would never fire — worse than off.
  it("rejects an enabled nudge with no time", async () => {
    await expect(
      caller.notifications.update({
        ...validPrefs,
        nudges: [{ type: "CHECK_IN", enabled: true, time: null }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects more nudges than there are types", async () => {
    const tooMany = Array.from({ length: 6 }, () => ({
      type: "CHECK_IN" as const,
      enabled: false,
      time: null,
    }));
    await expect(
      caller.notifications.update({ ...validPrefs, nudges: tooMany }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("drops a client-supplied userId — the owner comes from the session", () => {
    const parsed = notificationPrefsInput.parse({ ...validPrefs, userId: "someone-else" });
    expect(parsed).not.toHaveProperty("userId");
  });
});

describe("defaults are distinguishable from a real save", () => {
  // A device that migrated settings from the old single-reminder model must be
  // able to tell "the server has nothing" from "the server says everything is
  // off" — otherwise the first sync silently switches the user's reminders off.
  it("the default prefs a fresh account receives are all disabled", () => {
    expect(defaultNotificationPrefs().nudges.every((n) => !n.enabled)).toBe(true);
  });

  it("so an all-off payload is a valid save, and only `stored` separates the two", () => {
    const allOff = {
      ...validPrefs,
      nudges: validPrefs.nudges.map((n) => ({ ...n, enabled: false })),
    };
    expect(notificationPrefsInput.safeParse(allOff).success).toBe(true);
  });
});
