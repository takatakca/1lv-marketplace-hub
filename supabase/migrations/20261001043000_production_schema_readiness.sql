-- Production schema readiness marker.
-- The application health endpoint requires this exact value before a release
-- may be considered production-compatible.
CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261001043000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version() TO service_role;
