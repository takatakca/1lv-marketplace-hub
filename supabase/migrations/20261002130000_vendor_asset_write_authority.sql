-- Bind vendor asset writes to the authorized TAKATAK session and a real 1LV vendor.
-- Public storefront reads remain available through the existing SELECT policy,
-- but INSERT/UPDATE/DELETE may only target canonical application-generated paths.

CREATE OR REPLACE FUNCTION public.can_manage_vendor_asset(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.is_takatak_authorized_session()
    AND auth.uid()::text = (storage.foldername(_name))[1]
    AND storage.filename(_name) ~
      '^(logo|banner)-[0-9]{10,}-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.(png|jpg|webp|gif)$'
    AND EXISTS (
      SELECT 1
      FROM public.vendors AS v
      WHERE v.user_id = auth.uid()
        AND v.status::text NOT IN ('suspended', 'rejected')
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_vendor_asset(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_manage_vendor_asset(text)
TO authenticated, service_role;

DROP POLICY IF EXISTS "vendor-assets owner insert" ON storage.objects;
CREATE POLICY "vendor-assets owner insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vendor-assets'
  AND public.can_manage_vendor_asset(name)
);

DROP POLICY IF EXISTS "vendor-assets owner update" ON storage.objects;
CREATE POLICY "vendor-assets owner update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vendor-assets'
  AND public.can_manage_vendor_asset(name)
)
WITH CHECK (
  bucket_id = 'vendor-assets'
  AND public.can_manage_vendor_asset(name)
);

DROP POLICY IF EXISTS "vendor-assets owner delete" ON storage.objects;
CREATE POLICY "vendor-assets owner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vendor-assets'
  AND public.can_manage_vendor_asset(name)
);

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002130000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
