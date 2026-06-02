import { supabase } from "@/integrations/supabase/client";

export const VENDOR_BUCKET = "vendor-assets";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type UploadKind = "logo" | "banner";

export function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Use PNG, JPG, WEBP or GIF";
  if (file.size > MAX_IMAGE_BYTES) return "Max file size 5 MB";
  return null;
}

export async function uploadVendorImage(userId: string, kind: UploadKind, file: File): Promise<string> {
  const err = validateImage(file);
  if (err) throw new Error(err);
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(VENDOR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) throw error;
  // Bucket is private; use long-lived signed URL (1 year)
  const { data, error: sErr } = await supabase.storage.from(VENDOR_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  if (sErr) throw sErr;
  return data.signedUrl;
}
