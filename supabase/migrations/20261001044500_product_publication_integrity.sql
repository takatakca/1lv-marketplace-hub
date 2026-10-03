-- Prevent incomplete or commercially invalid products from entering any public/reviewable state.
-- This trigger runs after the marketplace lifecycle trigger (alphabetical trigger order)
-- and therefore validates the final status that will be persisted.

CREATE OR REPLACE FUNCTION public.validate_product_publication_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.inventory_quantity < 0 THEN
    RAISE EXCEPTION 'Inventory quantity cannot be negative'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.price < 0 THEN
    RAISE EXCEPTION 'Product price cannot be negative'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.compare_at_price IS NOT NULL AND NEW.compare_at_price < 0 THEN
    RAISE EXCEPTION 'Compare-at price cannot be negative'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.status IN (
    'active'::public.product_status,
    'pending_review'::public.product_status
  ) THEN
    IF NULLIF(btrim(NEW.title), '') IS NULL THEN
      RAISE EXCEPTION 'Published products require a title'
        USING ERRCODE = '22023';
    END IF;

    IF NULLIF(btrim(NEW.slug), '') IS NULL THEN
      RAISE EXCEPTION 'Published products require a slug'
        USING ERRCODE = '22023';
    END IF;

    IF NULLIF(btrim(COALESCE(NEW.category_slug, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Published products require a category'
        USING ERRCODE = '22023';
    END IF;

    IF NEW.price <= 0 THEN
      RAISE EXCEPTION 'Published products require a positive price'
        USING ERRCODE = '22023';
    END IF;

    IF NEW.compare_at_price IS NOT NULL
       AND NEW.compare_at_price <= NEW.price THEN
      RAISE EXCEPTION 'Compare-at price must exceed the selling price'
        USING ERRCODE = '22023';
    END IF;

    IF NEW.track_inventory AND NEW.inventory_quantity <= 0 THEN
      RAISE EXCEPTION 'Tracked products require available inventory before publication'
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(NEW.images) <> 'array'
       OR jsonb_array_length(NEW.images) = 0 THEN
      RAISE EXCEPTION 'Published products require at least one image'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.images) AS image(value)
      WHERE jsonb_typeof(image.value) = 'string'
        AND NULLIF(btrim(image.value #>> '{}'), '') IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Published products require at least one valid image URL'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_product_publication_integrity()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_validate_publication_integrity
ON public.products;

CREATE TRIGGER products_validate_publication_integrity
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.validate_product_publication_integrity();

-- Advance the production schema marker. The public health endpoint requires
-- this exact value before a deployment is considered healthy.
CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261001044500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
