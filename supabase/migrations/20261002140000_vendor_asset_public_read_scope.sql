-- Restrict private vendor branding reads to assets that are actually
-- referenced by an eligible public vendor, or to an authorized owner/admin.
-- This replaces the historical bucket-wide anonymous SELECT policy.

CREATE OR REPLACE FUNCTION public.can_read_vendor_asset(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(NULLIF(btrim(_name), ''), '') <> ''
    AND EXISTS (
      SELECT 1
      FROM public.vendors AS v
      WHERE (
        v.logo_url = _name
        OR v.banner_url = _name
      )
      AND (
        (
          v.status = 'active'::public.vendor_status
          AND v.subscription_status IN ('active', 'trialing')
        )
        OR (
          auth.uid() IS NOT NULL
          AND public.is_takatak_authorized_session()
          AND (
            v.user_id = auth.uid()
            OR public.has_role(auth.uid(), 'admin'::public.app_role)
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_vendor_asset(text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_read_vendor_asset(text)
TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "vendor-assets public read" ON storage.objects;

CREATE POLICY "vendor-assets scoped read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'vendor-assets'
  AND public.can_read_vendor_asset(name)
);

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002140000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
