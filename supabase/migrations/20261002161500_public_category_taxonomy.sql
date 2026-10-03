-- Public category taxonomy must follow the persistent admin-managed table.
-- Expose only active storefront-safe taxonomy fields; keep admin state private.

CREATE OR REPLACE FUNCTION public.list_public_categories()
RETURNS TABLE (
  slug text,
  name_en text,
  name_fr text,
  parent_slug text,
  "position" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.slug,
    c.name_en,
    c.name_fr,
    c.parent_slug,
    c.position
  FROM public.categories AS c
  WHERE c.active = true
  ORDER BY
    CASE WHEN c.parent_slug IS NULL THEN 0 ELSE 1 END,
    c.position,
    c.name_en,
    c.slug;
$$;

CREATE OR REPLACE FUNCTION public.get_public_category_by_slug(
  _slug text
)
RETURNS TABLE (
  slug text,
  name_en text,
  name_fr text,
  parent_slug text,
  "position" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.slug,
    c.name_en,
    c.name_fr,
    c.parent_slug,
    c.position
  FROM public.categories AS c
  WHERE c.active = true
    AND c.slug = btrim(COALESCE(_slug, ''))
    AND btrim(COALESCE(_slug, '')) <> ''
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.list_public_categories() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_category_by_slug(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_public_categories()
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_category_by_slug(text)
TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002161500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
