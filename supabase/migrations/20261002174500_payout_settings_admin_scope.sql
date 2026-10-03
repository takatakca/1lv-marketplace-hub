-- Payout scheduler configuration is marketplace-internal operational data.
-- Vendors/customers do not use it; only admins and service-role authorities need read access.

DROP POLICY IF EXISTS "authenticated read payout settings"
ON public.payout_settings;

DROP POLICY IF EXISTS "admins read payout settings"
ON public.payout_settings;

CREATE POLICY "admins read payout settings"
ON public.payout_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002174500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
