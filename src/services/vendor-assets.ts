import { supabase } from "@/integrations/supabase/client";

const BUCKET = "vendor-assets";
const MAX_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type VendorAssetKind = "logo" | "banner";

export function validateImageFile(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return "Image must be PNG, JPG, WEBP or GIF";
  if (file.size > MAX_BYTES) return "Image must be under 4MB";
  return null;
}

export async function uploadVendorAsset(userId: string, kind: VendorAssetKind, file: File) {
  const err = validateImageFile(file);
  if (err) throw new Error(err);
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

/** Resolve a stored path to a signed URL (1y TTL). Pass-through if it's already an http(s) URL. */
export async function resolveAssetUrl(pathOrUrl: string | null | undefined): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pathOrUrl, 60 * 60 * 24 * 365);
  if (error) return null;
  return data?.signedUrl ?? null;
}
