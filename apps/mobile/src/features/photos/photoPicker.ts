/**
 * Camera / library access for progress photos.
 *
 * Wrapped rather than called inline for two reasons. First, expo-image-picker
 * is a native module: on a dev client built before it was added, importing it
 * at module scope takes the whole screen down, so it is required lazily and a
 * miss becomes a readable message instead of a crash. Second, every failure
 * here needs to say what actually happened — a permission the user declined is
 * not the same as a cancelled pick, and neither is an error.
 */

export type PickedPhoto = {
  uri: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
  byteSize: number;
};

export type PickResult =
  | { ok: true; photo: PickedPhoto }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "denied" | "unavailable" | "error"; message: string };

/** The bucket accepts these four; anything else is rejected before upload. */
function normaliseMime(raw: string | null | undefined, uri: string): PickedPhoto["mimeType"] | null {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("png")) return "image/png";
  if (value.includes("webp")) return "image/webp";
  if (value.includes("heic") || value.includes("heif")) return "image/heic";
  if (value.includes("jpeg") || value.includes("jpg")) return "image/jpeg";
  // Some Android providers hand back no type at all; fall back to the extension.
  const ext = uri.split("?")[0]?.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

const MAX_BYTES = 10 * 1024 * 1024;

export async function pickPhoto(source: "camera" | "library"): Promise<PickResult> {
  let picker: typeof import("expo-image-picker");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    picker = require("expo-image-picker") as typeof import("expo-image-picker");
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      message: "Adding photos needs an updated version of the app. Nothing has been saved.",
    };
  }

  try {
    const permission =
      source === "camera"
        ? await picker.requestCameraPermissionsAsync()
        : await picker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return {
        ok: false,
        reason: "denied",
        message:
          source === "camera"
            ? "BIOSYNC doesn't have camera access. You can turn it on in system settings."
            : "BIOSYNC doesn't have access to your photos. You can turn it on in system settings.",
      };
    }

    const result =
      source === "camera"
        ? await picker.launchCameraAsync({ quality: 0.85, exif: false })
        : await picker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.85,
            exif: false,
          });

    if (result.canceled) return { ok: false, reason: "cancelled" };
    const asset = result.assets?.[0];
    if (!asset) return { ok: false, reason: "cancelled" };

    const mimeType = normaliseMime(asset.mimeType, asset.uri);
    if (mimeType === null) {
      return {
        ok: false,
        reason: "error",
        message: "That file isn't an image BIOSYNC can store. Try a JPEG or PNG.",
      };
    }

    const byteSize = asset.fileSize ?? 0;
    if (byteSize > MAX_BYTES) {
      return {
        ok: false,
        reason: "error",
        message: "That photo is over 10 MB. Try a smaller one.",
      };
    }

    return { ok: true, photo: { uri: asset.uri, mimeType, byteSize: byteSize || 1 } };
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "Couldn't open that. Nothing has been saved — please try again.",
    };
  }
}
