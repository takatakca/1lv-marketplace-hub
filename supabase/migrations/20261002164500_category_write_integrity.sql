-- Protect the persistent category taxonomy from accidental duplicates/orphans.
-- Category slugs are stable identifiers used by products and storefront routes;
-- renames require an explicit future migration rather than an upsert that silently
-- creates a second taxonomy node.

CREATE OR REPLACE FUNCTION public.validate_category_write_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent text;
BEGIN
  NEW.slug := lower(btrim(COALESCE(NEW.slug, '')));
  NEW.name_en := btrim(COALESCE(NEW.name_en, ''));
  NEW.name_fr := NULLIF(btrim(COALESCE(NEW.name_fr, '')), '');
  NEW.parent_slug := NULLIF(lower(btrim(COALESCE(NEW.parent_slug, ''))), '');

  IF NEW.slug = ''
     OR length(NEW.slug) > 100
     OR NEW.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Category slug must use lowercase kebab-case'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.name_en = '' OR length(NEW.name_en) > 160 THEN
    RAISE EXCEPTION 'Category English name is required and must be 160 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.name_fr IS NOT NULL AND length(NEW.name_fr) > 160 THEN
    RAISE EXCEPTION 'Category French name must be 160 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Category slug cannot be renamed in place'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.parent_slug = NEW.slug THEN
    RAISE EXCEPTION 'Category cannot be its own parent'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.parent_slug IS NOT NULL THEN
    SELECT c.slug
    INTO v_parent
    FROM public.categories AS c
    WHERE c.slug = NEW.parent_slug;

    IF v_parent IS NULL THEN
      RAISE EXCEPTION 'Category parent does not exist'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT
          c.slug,
          c.parent_slug,
          ARRAY[c.slug]::text[] AS path
        FROM public.categories AS c
        WHERE c.slug = NEW.parent_slug

        UNION ALL

        SELECT
          parent.slug,
          parent.parent_slug,
          ancestors.path || parent.slug
        FROM public.categories AS parent
        JOIN ancestors
          ON parent.slug = ancestors.parent_slug
        WHERE NOT parent.slug = ANY(ancestors.path)
      )
      SELECT 1
      FROM ancestors
      WHERE slug = NEW.slug
    ) THEN
      RAISE EXCEPTION 'Category hierarchy cannot contain a cycle'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_category_write_integrity()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS categories_validate_write_integrity
ON public.categories;

CREATE TRIGGER categories_validate_write_integrity
BEFORE INSERT OR UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.validate_category_write_integrity();

CREATE OR REPLACE FUNCTION public.guard_category_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.categories AS child
    WHERE child.parent_slug = OLD.slug
  ) THEN
    RAISE EXCEPTION 'Category cannot be deleted while child categories exist'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.products AS p
    WHERE p.category_slug = OLD.slug
  ) THEN
    RAISE EXCEPTION 'Category cannot be deleted while products reference it'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_category_delete()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS categories_guard_delete
ON public.categories;

CREATE TRIGGER categories_guard_delete
BEFORE DELETE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.guard_category_delete();

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002164500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
