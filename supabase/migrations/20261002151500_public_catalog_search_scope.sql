-- Search the eligible public marketplace before applying the result limit.
-- This prevents valid older products from becoming undiscoverable once the
-- global storefront contains more than the client-side catalog cap.

CREATE OR REPLACE FUNCTION public.search_public_catalog_products(
  _query text DEFAULT NULL,
  _category_slug text DEFAULT NULL,
  _min_price numeric DEFAULT NULL,
  _max_price numeric DEFAULT NULL,
  _canadian_only boolean DEFAULT false,
  _sale_only boolean DEFAULT false,
  _sort text DEFAULT 'relevance',
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
  WITH input AS (
    SELECT
      lower(btrim(COALESCE(_query, ''))) AS q,
      NULLIF(btrim(COALESCE(_category_slug, '')), '') AS category_slug,
      CASE
        WHEN _min_price IS NULL THEN NULL
        ELSE GREATEST(_min_price, 0)
      END AS min_price,
      CASE
        WHEN _max_price IS NULL THEN NULL
        ELSE GREATEST(_max_price, 0)
      END AS max_price,
      COALESCE(_canadian_only, false) AS canadian_only,
      COALESCE(_sale_only, false) AS sale_only,
      CASE
        WHEN lower(COALESCE(_sort, 'relevance')) IN (
          'relevance',
          'price-asc',
          'price-desc',
          'sold'
        )
        THEN lower(COALESCE(_sort, 'relevance'))
        ELSE 'relevance'
      END AS sort_mode
  ),
  sales AS (
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
  ),
  eligible AS (
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
      p.updated_at,
      i.q,
      i.sort_mode
    FROM public.products AS p
    JOIN public.vendors AS v
      ON v.id = p.vendor_id
     AND v.status = 'active'::public.vendor_status
     AND v.subscription_status IN ('active', 'trialing')
    CROSS JOIN input AS i
    LEFT JOIN sales AS s ON s.product_id = p.id
    WHERE p.status = 'active'::public.product_status
      AND (NOT p.track_inventory OR p.inventory_quantity > 0)
      AND (
        i.q = ''
        OR strpos(
          lower(
            concat_ws(
              ' ',
              p.title,
              p.category_slug,
              p.description,
              p.short_description,
              v.store_name
            )
          ),
          i.q
        ) > 0
      )
      AND (i.category_slug IS NULL OR p.category_slug = i.category_slug)
      AND (i.min_price IS NULL OR p.price >= i.min_price)
      AND (i.max_price IS NULL OR p.price <= i.max_price)
      AND (NOT i.canadian_only OR v.country = 'CA')
      AND (
        NOT i.sale_only
        OR (
          p.compare_at_price IS NOT NULL
          AND p.compare_at_price > p.price
        )
      )
  )
  SELECT
    e.id,
    e.vendor_id,
    e.vendor_slug,
    e.vendor_name,
    e.vendor_country,
    e.slug,
    e.title,
    e.description,
    e.short_description,
    e.category_slug,
    e.price,
    e.compare_at_price,
    e.inventory_quantity,
    e.track_inventory,
    e.images,
    e.sold_count,
    e.created_at,
    e.updated_at
  FROM eligible AS e
  ORDER BY
    CASE
      WHEN e.sort_mode = 'relevance'
       AND e.q <> ''
       AND lower(e.title) = e.q
      THEN 0
      WHEN e.sort_mode = 'relevance'
       AND e.q <> ''
       AND strpos(lower(e.title), e.q) > 0
      THEN 1
      WHEN e.sort_mode = 'relevance' AND e.q <> ''
      THEN 2
      ELSE 0
    END ASC,
    CASE WHEN e.sort_mode = 'price-asc' THEN e.price END ASC,
    CASE WHEN e.sort_mode = 'price-desc' THEN e.price END DESC,
    CASE WHEN e.sort_mode = 'sold' THEN e.sold_count END DESC,
    e.updated_at DESC,
    e.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.search_public_catalog_products(
  text,
  text,
  numeric,
  numeric,
  boolean,
  boolean,
  text,
  integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_public_catalog_products(
  text,
  text,
  numeric,
  numeric,
  boolean,
  boolean,
  text,
  integer
) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002151500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
