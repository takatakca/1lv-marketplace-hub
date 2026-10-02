-- Remove obsolete browser-readable helper RPCs now that the public storefront
-- uses fixed-column catalog RPCs and checkout pricing/commission is server-authoritative.
-- Keep service_role access for controlled server/admin maintenance only.

REVOKE ALL ON FUNCTION public.get_vendor_commission_rates(uuid[])
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_commission_rates(uuid[])
TO service_role;

REVOKE ALL ON FUNCTION public.get_public_product_by_slug(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_product_by_slug(text)
TO service_role;

REVOKE ALL ON FUNCTION public.list_public_products(integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_products(integer)
TO service_role;

-- These historical views are retained only for migration compatibility, but
-- remain unreachable from browser roles. Public browsing is via
-- list_public_catalog_products/get_public_catalog_product_by_slug and
-- list_public_vendors/get_public_vendor_by_slug.
REVOKE ALL ON TABLE public.public_products
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_vendors
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002103000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
