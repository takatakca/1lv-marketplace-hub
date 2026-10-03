-- Enforce one authoritative GROUPE TAKATAK identity per local 1LV profile/vendor.
-- These remote identifiers are written only by trusted server-side synchronization.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_takatak_person_id_unique
  ON public.profiles (takatak_person_id)
  WHERE takatak_person_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vendors_takatak_merchant_id_unique
  ON public.vendors (takatak_merchant_id)
  WHERE takatak_merchant_id IS NOT NULL;

-- Advance the production schema marker so a deployment cannot be declared
-- healthy until the identity-link constraints exist in the exact 1LV database.
CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261001064000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
