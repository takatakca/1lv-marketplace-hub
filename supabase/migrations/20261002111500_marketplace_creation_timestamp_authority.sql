-- Browser vendors must not forge marketplace creation timestamps.
-- Public storefront badges/tenure derive from created_at, so vendor/product
-- creation time is database-authoritative. Admin/service roles may still perform
-- controlled data repair/imports.

CREATE OR REPLACE FUNCTION public.enforce_marketplace_creation_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_service boolean := current_user IN (
    'service_role',
    'postgres',
    'supabase_admin'
  );
BEGIN
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NOT NULL THEN
    v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);
  END IF;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated marketplace session required'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Marketplace creation timestamp is server-authoritative'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_marketplace_creation_timestamps()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vendors_creation_timestamp_authority
ON public.vendors;
CREATE TRIGGER vendors_creation_timestamp_authority
BEFORE INSERT OR UPDATE ON public.vendors
FOR EACH ROW
EXECUTE FUNCTION public.enforce_marketplace_creation_timestamps();

DROP TRIGGER IF EXISTS products_creation_timestamp_authority
ON public.products;
CREATE TRIGGER products_creation_timestamp_authority
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_marketplace_creation_timestamps();

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002111500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
