-- Make the admin-managed category taxonomy authoritative for all public product surfaces.
-- Public callers use curated SECURITY DEFINER RPCs; the base categories table is
-- no longer directly readable by everyone. A public category must be active and
-- every ancestor in its parent chain must also exist and be active.

DROP POLICY IF EXISTS "Categories viewable by everyone" ON public.categories;

CREATE OR REPLACE FUNCTION public.category_is_public(_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE chain AS (
    SELECT
      c.slug,
      c.parent_slug,
      c.active,
      ARRAY[c.slug]::text[] AS path
    FROM public.categories AS c
    WHERE c.slug = btrim(COALESCE(_slug, ''))
      AND btrim(COALESCE(_slug, '')) <> ''

    UNION ALL

    SELECT
      parent.slug,
      parent.parent_slug,
      parent.active,
      chain.path || parent.slug
    FROM public.categories AS parent
    JOIN chain
      ON parent.slug = chain.parent_slug
    WHERE NOT parent.slug = ANY(chain.path)
  )
  SELECT COALESCE(
    bool_and(chain.active)
    AND bool_or(chain.parent_slug IS NULL),
    false
  )
  FROM chain;
$$;

REVOKE ALL ON FUNCTION public.category_is_public(text)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_product_public_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN (
    'active'::public.product_status,
    'pending_review'::public.product_status
  )
  AND (
    TG_OP = 'INSERT'
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.category_slug IS DISTINCT FROM NEW.category_slug
  )
  AND NOT public.category_is_public(NEW.category_slug) THEN
    RAISE EXCEPTION
      'Published or reviewable products require an active public category'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_product_public_category()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_products_public_category_authority
ON public.products;

-- Prefix with zz_ so this final-state validation runs after the existing
-- marketplace/vendor BEFORE triggers, including active -> pending_review rewrites.
CREATE TRIGGER zz_products_public_category_authority
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_product_public_category();

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
  WHERE public.category_is_public(c.slug)
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
  WHERE c.slug = btrim(COALESCE(_slug, ''))
    AND btrim(COALESCE(_slug, '')) <> ''
    AND public.category_is_public(c.slug)
  LIMIT 1;
$$;

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
    v.slug,
    v.store_name,
    v.country,
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
    COALESCE(s.sold_count, 0)::bigint,
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
    AND public.category_is_public(p.category_slug)
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
    v.slug,
    v.store_name,
    v.country,
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
    ), 0)::bigint,
    p.created_at,
    p.updated_at
  FROM public.products AS p
  JOIN public.vendors AS v
    ON v.id = p.vendor_id
   AND v.status = 'active'::public.vendor_status
   AND v.subscription_status IN ('active', 'trialing')
  WHERE p.slug = btrim(COALESCE(_slug, ''))
    AND btrim(COALESCE(_slug, '')) <> ''
    AND p.status = 'active'::public.product_status
    AND public.category_is_public(p.category_slug)
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
    v.slug,
    v.store_name,
    v.country,
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
    COALESCE(s.sold_count, 0)::bigint,
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
    AND public.category_is_public(p.category_slug)
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
    v.slug,
    v.store_name,
    v.country,
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
    COALESCE(s.sold_count, 0)::bigint,
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
    AND public.category_is_public(p.category_slug)
    AND p.status = 'active'::public.product_status
    AND (NOT p.track_inventory OR p.inventory_quantity > 0)
  ORDER BY p.updated_at DESC, p.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 100);
$$;

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
      CASE WHEN _min_price IS NULL THEN NULL ELSE GREATEST(_min_price, 0) END AS min_price,
      CASE WHEN _max_price IS NULL THEN NULL ELSE GREATEST(_max_price, 0) END AS max_price,
      COALESCE(_canadian_only, false) AS canadian_only,
      COALESCE(_sale_only, false) AS sale_only,
      CASE
        WHEN lower(COALESCE(_sort, 'relevance')) IN (
          'relevance', 'price-asc', 'price-desc', 'sold', 'newest'
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
      AND public.category_is_public(p.category_slug)
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
    CASE WHEN e.sort_mode = 'newest' THEN e.created_at END DESC,
    e.updated_at DESC,
    e.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.list_public_categories() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_category_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_catalog_products(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_catalog_product_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_catalog_products_for_vendor(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_catalog_products_for_category(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_public_catalog_products(
  text, text, numeric, numeric, boolean, boolean, text, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_public_categories()
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_category_by_slug(text)
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_catalog_products(integer)
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_catalog_product_by_slug(text)
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_catalog_products_for_vendor(text, integer)
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_catalog_products_for_category(text, integer)
TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_public_catalog_products(
  text, text, numeric, numeric, boolean, boolean, text, integer
) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002163000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
