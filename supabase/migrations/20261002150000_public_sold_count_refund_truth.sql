-- Public social-proof counts must reflect retained sales.
-- Fully refunded orders are not counted as "sold" on storefront surfaces.

CREATE OR REPLACE FUNCTION public.list_public_catalog_products(
  _limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  vendor_id uuid,
  vendor_slug text,
  vendor_name text,
  vendor_country text,
  slug text,
  title text,
  description text,
  short_description text,
  category_slug text,
  price numeric,
  compare_at_price numeric,
  inventory_quantity integer,
  track_inventory boolean,
  images jsonb,
  sold_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id,
    p.vendor_id,
    v.slug AS vendor_slug,
    v.store_name AS vendor_name,
    v.country AS vendor_country,
    p.slug,
    p.title,
    p.description,
    p.short_description,
    p.category_slug,
    p.price,
    p.compare_at_price,
    p.inventory_quantity,
    p.track_inventory,
    p.images,
    COALESCE(s.sold_count, 0)::bigint AS sold_count,
    p.created_at,
    p.updated_at
  FROM public.products AS p
  JOIN public.vendors AS v
    ON v.id = p.vendor_id
   AND v.status = 'active'::public.vendor_status
   AND v.subscription_status IN ('active', 'trialing')
  LEFT JOIN (
    SELECT
      oi.product_id,
      SUM(oi.quantity)::bigint AS sold_count
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
      AND o.payment_status IN (
        'paid'::public.payment_status,
        'partially_refunded'::public.payment_status
      )
    GROUP BY oi.product_id
  ) AS s ON s.product_id = p.id
  WHERE p.status = 'active'::public.product_status
    AND (NOT p.track_inventory OR p.inventory_quantity > 0)
  ORDER BY p.updated_at DESC, p.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.get_public_catalog_product_by_slug(
  _slug text
)
RETURNS TABLE (
  id uuid,
  vendor_id uuid,
  vendor_slug text,
  vendor_name text,
  vendor_country text,
  slug text,
  title text,
  description text,
  short_description text,
  category_slug text,
  price numeric,
  compare_at_price numeric,
  inventory_quantity integer,
  track_inventory boolean,
  images jsonb,
  sold_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id,
    p.vendor_id,
    v.slug AS vendor_slug,
    v.store_name AS vendor_name,
    v.country AS vendor_country,
    p.slug,
    p.title,
    p.description,
    p.short_description,
    p.category_slug,
    p.price,
    p.compare_at_price,
    p.inventory_quantity,
    p.track_inventory,
    p.images,
    COALESCE((
      SELECT SUM(oi.quantity)::bigint
      FROM public.order_items AS oi
      JOIN public.orders AS o ON o.id = oi.order_id
      WHERE oi.product_id = p.id
        AND o.payment_status IN (
          'paid'::public.payment_status,
          'partially_refunded'::public.payment_status
        )
    ), 0)::bigint AS sold_count,
    p.created_at,
    p.updated_at
  FROM public.products AS p
  JOIN public.vendors AS v
    ON v.id = p.vendor_id
   AND v.status = 'active'::public.vendor_status
   AND v.subscription_status IN ('active', 'trialing')
  WHERE p.slug = _slug
    AND p.status = 'active'::public.product_status
    AND (NOT p.track_inventory OR p.inventory_quantity > 0)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.list_public_catalog_products_for_vendor(
  _vendor_slug text,
  _limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  vendor_id uuid,
  vendor_slug text,
  vendor_name text,
  vendor_country text,
  slug text,
  title text,
  description text,
  short_description text,
  category_slug text,
  price numeric,
  compare_at_price numeric,
  inventory_quantity integer,
  track_inventory boolean,
  images jsonb,
  sold_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id,
    p.vendor_id,
    v.slug AS vendor_slug,
    v.store_name AS vendor_name,
    v.country AS vendor_country,
    p.slug,
    p.title,
    p.description,
    p.short_description,
    p.category_slug,
    p.price,
    p.compare_at_price,
    p.inventory_quantity,
    p.track_inventory,
    p.images,
    COALESCE(s.sold_count, 0)::bigint AS sold_count,
    p.created_at,
    p.updated_at
  FROM public.products AS p
  JOIN public.vendors AS v
    ON v.id = p.vendor_id
   AND v.status = 'active'::public.vendor_status
   AND v.subscription_status IN ('active', 'trialing')
  LEFT JOIN (
    SELECT
      oi.product_id,
      SUM(oi.quantity)::bigint AS sold_count
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
      AND o.payment_status IN (
        'paid'::public.payment_status,
        'partially_refunded'::public.payment_status
      )
    GROUP BY oi.product_id
  ) AS s ON s.product_id = p.id
  WHERE v.slug = btrim(COALESCE(_vendor_slug, ''))
    AND btrim(COALESCE(_vendor_slug, '')) <> ''
    AND p.status = 'active'::public.product_status
    AND (NOT p.track_inventory OR p.inventory_quantity > 0)
  ORDER BY p.updated_at DESC, p.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.list_public_catalog_products_for_category(
  _category_slug text,
  _limit integer DEFAULT 24
)
RETURNS TABLE (
  id uuid,
  vendor_id uuid,
  vendor_slug text,
  vendor_name text,
  vendor_country text,
  slug text,
  title text,
  description text,
  short_description text,
  category_slug text,
  price numeric,
  compare_at_price numeric,
  inventory_quantity integer,
  track_inventory boolean,
  images jsonb,
  sold_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id,
    p.vendor_id,
    v.slug AS vendor_slug,
    v.store_name AS vendor_name,
    v.country AS vendor_country,
    p.slug,
    p.title,
    p.description,
    p.short_description,
    p.category_slug,
    p.price,
    p.compare_at_price,
    p.inventory_quantity,
    p.track_inventory,
    p.images,
    COALESCE(s.sold_count, 0)::bigint AS sold_count,
    p.created_at,
    p.updated_at
  FROM public.products AS p
  JOIN public.vendors AS v
    ON v.id = p.vendor_id
   AND v.status = 'active'::public.vendor_status
   AND v.subscription_status IN ('active', 'trialing')
  LEFT JOIN (
    SELECT
      oi.product_id,
      SUM(oi.quantity)::bigint AS sold_count
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
      AND o.payment_status IN (
        'paid'::public.payment_status,
        'partially_refunded'::public.payment_status
      )
    GROUP BY oi.product_id
  ) AS s ON s.product_id = p.id
  WHERE p.category_slug = btrim(COALESCE(_category_slug, ''))
    AND btrim(COALESCE(_category_slug, '')) <> ''
    AND p.status = 'active'::public.product_status
    AND (NOT p.track_inventory OR p.inventory_quantity > 0)
  ORDER BY p.updated_at DESC, p.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.list_public_catalog_products(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_catalog_product_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_catalog_products_for_vendor(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_catalog_products_for_category(text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_public_catalog_products(integer)
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_catalog_product_by_slug(text)
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_catalog_products_for_vendor(text, integer)
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_catalog_products_for_category(text, integer)
TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002150000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
