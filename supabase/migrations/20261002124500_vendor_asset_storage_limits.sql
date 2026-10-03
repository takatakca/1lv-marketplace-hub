-- Enforce vendor asset constraints at the Storage layer.
-- Browser validation is UX only; the bucket must reject oversized or
-- unexpected file types even when a client bypasses the application UI.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'vendor-assets',
  'vendor-assets',
  false,
  4194304,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002124500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
