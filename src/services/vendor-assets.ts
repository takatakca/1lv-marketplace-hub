import { supabase } from "@/integrations/supabase/client";

const BUCKET = "vendor-assets";
const MAX_BYTES = 4 * 1024 * 1024; // 4MB
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSION_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
const ALLOWED = Object.keys(EXTENSION_BY_MIME);

export type VendorAssetKind = "logo" | "banner";

export function validateImageFile(file: File): string | null {
  if (!ALLOWED.includes(file.type)) {
    return "Image must be PNG, JPG, WEBP or GIF";
  }
  if (file.size <= 0) return "Image file is empty";
  if (file.size > MAX_BYTES) return "Image must be under 4MB";
  return null;
}

export async function uploadVendorAsset(
  userId: string,
  kind: VendorAssetKind,
  file: File,
) {
  const err = validateImageFile(file);
  if (err) throw new Error(err);
  if (!UUID_RE.test(userId)) throw new Error("Invalid vendor asset owner.");

  const ext =
    EXTENSION_BY_MIME[file.type as keyof typeof EXTENSION_BY_MIME];
  if (!ext) throw new Error("Unsupported vendor asset type.");

  const path =
    `${userId}/${kind}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "31536000",
    });
  if (error) throw error;
  return path;
}

export async function deleteVendorAsset(
  path: string | null | undefined,
): Promise<void> {
  if (!path || /^https?:\/\//i.test(path)) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/** Resolve a stored path to a short-lived signed URL. Pass-through supports legacy admin-managed http(s) URLs. */
export async function resolveAssetUrl(
  pathOrUrl: string | null | undefined,
): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pathOrUrl, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}
