/**
 * Authorization + input validation for the photos router. These are the most
 * sensitive records in the app, so the cases here are about who is refused:
 * every one is rejected by middleware or the Zod parser before a resolver
 * touches Prisma or storage.
 */
import { describe, it, expect } from "vitest";
import { photoUploadInput } from "@pulse/shared";
import { appRouter } from "../router";
import { ctx } from "./testContext";

const validUpload = {
  takenOn: "2026-08-28",
  mimeType: "image/jpeg" as const,
  byteSize: 2048,
  audienceOverride: null,
};

describe("photos authorization", () => {
  const anon = appRouter.createCaller(ctx(null));

  it("no token → UNAUTHORIZED on list", async () => {
    await expect(anon.photos.list({ limit: 10 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("no token → UNAUTHORIZED on createUploadUrl", async () => {
    await expect(anon.photos.createUploadUrl(validUpload)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("no token → UNAUTHORIZED on setVisibility", async () => {
    await expect(
      anon.photos.setVisibility({
        id: "00000000-0000-4000-8000-000000000000",
        audienceOverride: null,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("no token → UNAUTHORIZED on remove", async () => {
    await expect(
      anon.photos.remove({ id: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("photos input validation", () => {
  const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));

  it("rejects a file type the private bucket does not accept", async () => {
    await expect(
      caller.photos.createUploadUrl({ ...validUpload, mimeType: "image/gif" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a file past the bucket's 10 MB ceiling", async () => {
    await expect(
      caller.photos.createUploadUrl({ ...validUpload, byteSize: 10 * 1024 * 1024 + 1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a malformed date", async () => {
    await expect(
      caller.photos.createUploadUrl({ ...validUpload, takenOn: "28-08-2026" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a non-uuid photo id", async () => {
    await expect(caller.photos.remove({ id: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("drops a client-supplied userId — the owner comes from the session", () => {
    const parsed = photoUploadInput.parse({ ...validUpload, userId: "someone-else" });
    expect(parsed).not.toHaveProperty("userId");
  });
});

describe("upload paths are owned, not chosen", () => {
  // confirmUpload takes a path back from the client, so it must refuse one
  // that isn't under this user's prefix — otherwise a caller could attach
  // another user's object to a row in their own gallery.
  it("refuses to confirm a path belonging to another user", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(
      caller.photos.confirmUpload({ ...validUpload, path: "u2/aaaa.jpg" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a path with no owner prefix at all", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(
      caller.photos.confirmUpload({ ...validUpload, path: "aaaa.jpg" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a traversal dressed as a prefix", async () => {
    const caller = appRouter.createCaller(ctx({ id: "u1", role: "USER" }));
    await expect(
      caller.photos.confirmUpload({ ...validUpload, path: "../u2/aaaa.jpg" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
