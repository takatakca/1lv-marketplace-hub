-- Marketplace-scale discovery and verified-purchase review foundation.
-- Reviews are bound to delivered order items and written only through guarded RPCs.
-- Public search gains typo-tolerant ranking, full-text matching, real rating filters,
-- stable pagination, and review-backed ranking without exposing private order data.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
BEGIN
  CREATE TYPE public.review_status AS ENUM (
    'pending',
    'published',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text,
  status public.review_status NOT NULL DEFAULT 'published'::public.review_status,
  verified_purchase boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_reviews_order_item_unique UNIQUE (order_item_id),
  CONSTRAINT product_reviews_title_length CHECK (
    title IS NULL OR length(title) <= 120
  ),
  CONSTRAINT product_reviews_body_length CHECK (
    body IS NULL OR length(body) <= 3000
  )
);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TAKATAK authenticated sessions only"
ON public.product_reviews;

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.product_reviews
AS RESTRICTIVE
FOR ALL
TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

REVOKE ALL ON TABLE public.product_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.product_reviews
TO service_role;

CREATE INDEX IF NOT EXISTS product_reviews_public_product_idx
ON public.product_reviews (product_id, created_at DESC)
WHERE status = 'published'::public.review_status;

CREATE INDEX IF NOT EXISTS product_reviews_customer_idx
ON public.product_reviews (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS products_catalog_search_document_idx
ON public.products
USING gin (
  to_tsvector(
    'simple'::regconfig,
    COALESCE(title, '') || ' ' ||
    COALESCE(short_description, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(category_slug, '') || ' ' ||
    COALESCE(sku, '')
  )
);

CREATE INDEX IF NOT EXISTS products_catalog_title_trgm_idx
ON public.products
USING gin (lower(title) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS vendors_catalog_name_trgm_idx
ON public.vendors
USING gin (lower(store_name) extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.submit_verified_product_review(
  _order_item_id uuid,
  _rating integer,
  _title text DEFAULT NULL,
  _body text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_product_id uuid;
  v_customer_id uuid;
  v_item_status text;
  v_payment_status text;
  v_delivered_at timestamptz;
  v_title text := NULLIF(btrim(COALESCE(_title, '')), '');
  v_body text := NULLIF(btrim(COALESCE(_body, '')), '');
  v_review public.product_reviews%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  IF _order_item_id IS NULL OR _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'A delivered order item and rating from 1 to 5 are required'
      USING ERRCODE = '22023';
  END IF;

  IF v_title IS NOT NULL AND length(v_title) > 120 THEN
    RAISE EXCEPTION 'Review title is too long'
      USING ERRCODE = '22023';
  END IF;

  IF v_body IS NOT NULL AND length(v_body) > 3000 THEN
    RAISE EXCEPTION 'Review body is too long'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    oi.product_id,
    o.customer_id,
    oi.status::text,
    o.payment_status::text,
    vo.delivered_at
  INTO
    v_product_id,
    v_customer_id,
    v_item_status,
    v_payment_status,
    v_delivered_at
  FROM public.order_items AS oi
  JOIN public.orders AS o
    ON o.id = oi.order_id
  JOIN public.vendor_orders AS vo
    ON vo.order_id = oi.order_id
   AND vo.vendor_id = oi.vendor_id
  WHERE oi.id = _order_item_id;

  IF NOT FOUND OR v_product_id IS NULL THEN
    RAISE EXCEPTION 'Reviewable order item not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_customer_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'This purchase does not belong to the current customer'
      USING ERRCODE = '42501';
  END IF;

  IF v_item_status <> 'delivered' OR v_delivered_at IS NULL THEN
    RAISE EXCEPTION 'Reviews are available only after confirmed delivery'
      USING ERRCODE = '22023';
  END IF;

  IF v_payment_status NOT IN ('paid', 'partially_refunded') THEN
    RAISE EXCEPTION 'A retained paid purchase is required to review this product'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.product_reviews AS pr (
    product_id,
    order_item_id,
    customer_id,
    rating,
    title,
    body,
    status,
    verified_purchase,
    published_at
  )
  VALUES (
    v_product_id,
    _order_item_id,
    v_user_id,
    _rating,
    v_title,
    v_body,
    'published'::public.review_status,
    true,
    now()
  )
  ON CONFLICT (order_item_id) DO UPDATE
  SET
    rating = EXCLUDED.rating,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    status = CASE
      WHEN pr.status = 'rejected'::public.review_status
        THEN 'pending'::public.review_status
      ELSE 'published'::public.review_status
    END,
    verified_purchase = true,
    published_at = CASE
      WHEN pr.status = 'rejected'::public.review_status
        THEN NULL
      ELSE now()
    END,
    updated_at = now()
  WHERE pr.customer_id = v_user_id
  RETURNING * INTO v_review;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review ownership mismatch'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'review_id', v_review.id,
    'product_id', v_review.product_id,
    'status', v_review.status::text,
    'verified_purchase', v_review.verified_purchase
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_verified_product_review(
  uuid,
  integer,
  text,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verified_product_review(
  uuid,
  integer,
  text,
  text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_public_product_reviews(
  _product_id uuid,
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  product_id uuid,
  rating smallint,
  title text,
  body text,
  verified_purchase boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    r.id,
    r.product_id,
    r.rating,
    r.title,
    r.body,
    r.verified_purchase,
    r.created_at
  FROM public.product_reviews AS r
  WHERE r.product_id = _product_id
    AND r.status = 'published'::public.review_status
  ORDER BY r.created_at DESC, r.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100)
  OFFSET LEAST(GREATEST(COALESCE(_offset, 0), 0), 10000);
$$;

REVOKE ALL ON FUNCTION public.list_public_product_reviews(
  uuid,
  integer,
  integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_product_reviews(
  uuid,
  integer,
  integer
) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_product_review_summary(
  _product_id uuid
)
RETURNS TABLE (
  product_id uuid,
  rating_average numeric,
  review_count bigint,
  rating_distribution jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _product_id,
    COALESCE(round(avg(r.rating)::numeric, 2), 0::numeric) AS rating_average,
    count(r.id)::bigint AS review_count,
    jsonb_build_object(
      '5', count(*) FILTER (WHERE r.rating = 5),
      '4', count(*) FILTER (WHERE r.rating = 4),
      '3', count(*) FILTER (WHERE r.rating = 3),
      '2', count(*) FILTER (WHERE r.rating = 2),
      '1', count(*) FILTER (WHERE r.rating = 1)
    ) AS rating_distribution
  FROM public.product_reviews AS r
  WHERE r.product_id = _product_id
    AND r.status = 'published'::public.review_status;
$$;

REVOKE ALL ON FUNCTION public.get_public_product_review_summary(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_product_review_summary(uuid)
TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.moderate_product_review(
  _review_id uuid,
  _status public.review_status
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL
     OR NOT public.is_takatak_authorized_session()
     OR NOT public.has_role(v_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Marketplace admin session required'
      USING ERRCODE = '42501';
  END IF;

  IF _review_id IS NULL
     OR _status NOT IN (
       'published'::public.review_status,
       'rejected'::public.review_status
     ) THEN
    RAISE EXCEPTION 'Valid moderation status required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.product_reviews
  SET
    status = _status,
    published_at = CASE
      WHEN _status = 'published'::public.review_status THEN now()
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = _review_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_product_review(
  uuid,
  public.review_status
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_product_review(
  uuid,
  public.review_status
) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_public_catalog_products_v2(
  _query text DEFAULT NULL,
  _category_slug text DEFAULT NULL,
  _min_price numeric DEFAULT NULL,
  _max_price numeric DEFAULT NULL,
  _canadian_only boolean DEFAULT false,
  _sale_only boolean DEFAULT false,
  _min_rating numeric DEFAULT NULL,
  _sort text DEFAULT 'relevance',
  _limit integer DEFAULT 60,
  _offset integer DEFAULT 0
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
  rating_average numeric,
  review_count bigint,
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
      lower(
        btrim(
          regexp_replace(
            COALESCE(_query, ''),
            '[^[:alnum:][:space:]-]+',
            ' ',
            'g'
          )
        )
      ) AS q,
      NULLIF(btrim(COALESCE(_category_slug, '')), '') AS category_slug,
      CASE
        WHEN _min_price IS NULL THEN NULL
        ELSE GREATEST(_min_price, 0)
      END AS min_price,
      CASE
        WHEN _max_price IS NULL THEN NULL
        ELSE GREATEST(_max_price, 0)
      END AS max_price,
      CASE
        WHEN _min_rating IS NULL THEN NULL
        ELSE LEAST(GREATEST(_min_rating, 0), 5)
      END AS min_rating,
      COALESCE(_canadian_only, false) AS canadian_only,
      COALESCE(_sale_only, false) AS sale_only,
      CASE
        WHEN lower(COALESCE(_sort, 'relevance')) IN (
          'relevance',
          'price-asc',
          'price-desc',
          'sold',
          'newest',
          'rating'
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
    JOIN public.orders AS o
      ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
      AND o.payment_status IN (
        'paid'::public.payment_status,
        'partially_refunded'::public.payment_status
      )
    GROUP BY oi.product_id
  ),
  reviews AS (
    SELECT
      r.product_id,
      round(avg(r.rating)::numeric, 2) AS rating_average,
      count(*)::bigint AS review_count
    FROM public.product_reviews AS r
    WHERE r.status = 'published'::public.review_status
    GROUP BY r.product_id
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
      COALESCE(r.rating_average, 0::numeric) AS rating_average,
      COALESCE(r.review_count, 0)::bigint AS review_count,
      p.created_at,
      p.updated_at,
      i.q,
      i.sort_mode,
      to_tsvector(
        'simple'::regconfig,
        COALESCE(p.title, '') || ' ' ||
        COALESCE(p.short_description, '') || ' ' ||
        COALESCE(p.description, '') || ' ' ||
        COALESCE(p.category_slug, '') || ' ' ||
        COALESCE(p.sku, '') || ' ' ||
        COALESCE(v.store_name, '')
      ) AS search_document,
      CASE
        WHEN i.q = '' THEN NULL
        ELSE websearch_to_tsquery('simple'::regconfig, i.q)
      END AS search_query
    FROM public.products AS p
    JOIN public.vendors AS v
      ON v.id = p.vendor_id
     AND v.status = 'active'::public.vendor_status
     AND v.subscription_status IN ('active', 'trialing')
    CROSS JOIN input AS i
    LEFT JOIN sales AS s
      ON s.product_id = p.id
    LEFT JOIN reviews AS r
      ON r.product_id = p.id
    WHERE p.status = 'active'::public.product_status
      AND (NOT p.track_inventory OR p.inventory_quantity > 0)
      AND (i.category_slug IS NULL OR p.category_slug = i.category_slug)
      AND (i.min_price IS NULL OR p.price >= i.min_price)
      AND (i.max_price IS NULL OR p.price <= i.max_price)
      AND (i.min_rating IS NULL OR COALESCE(r.rating_average, 0) >= i.min_rating)
      AND (NOT i.canadian_only OR v.country = 'CA')
      AND (
        NOT i.sale_only
        OR (
          p.compare_at_price IS NOT NULL
          AND p.compare_at_price > p.price
        )
      )
  ),
  scored AS (
    SELECT
      e.*,
      CASE
        WHEN e.q = '' THEN 0::real
        ELSE (
          CASE
            WHEN lower(e.title) = e.q THEN 100
            WHEN lower(e.title) LIKE e.q || '%' THEN 70
            WHEN strpos(lower(e.title), e.q) > 0 THEN 45
            ELSE 0
          END
          + CASE
              WHEN e.search_query IS NOT NULL
               AND e.search_document @@ e.search_query
              THEN ts_rank_cd(e.search_document, e.search_query) * 30
              ELSE 0
            END
          + extensions.similarity(lower(e.title), e.q) * 20
          + extensions.similarity(lower(e.vendor_name), e.q) * 8
        )::real
      END AS relevance_score
    FROM eligible AS e
    WHERE e.q = ''
       OR (
         e.search_query IS NOT NULL
         AND e.search_document @@ e.search_query
       )
       OR strpos(
         lower(
           concat_ws(
             ' ',
             e.title,
             e.category_slug,
             e.short_description,
             e.description,
             e.vendor_name
           )
         ),
         e.q
       ) > 0
       OR extensions.similarity(lower(e.title), e.q) >= 0.18
       OR extensions.similarity(lower(e.vendor_name), e.q) >= 0.25
  )
  SELECT
    s.id,
    s.vendor_id,
    s.vendor_slug,
    s.vendor_name,
    s.vendor_country,
    s.slug,
    s.title,
    s.description,
    s.short_description,
    s.category_slug,
    s.price,
    s.compare_at_price,
    s.inventory_quantity,
    s.track_inventory,
    s.images,
    s.sold_count,
    s.rating_average,
    s.review_count,
    s.created_at,
    s.updated_at
  FROM scored AS s
  ORDER BY
    CASE WHEN s.sort_mode = 'relevance' THEN s.relevance_score END DESC,
    CASE WHEN s.sort_mode = 'price-asc' THEN s.price END ASC,
    CASE WHEN s.sort_mode = 'price-desc' THEN s.price END DESC,
    CASE WHEN s.sort_mode = 'sold' THEN s.sold_count END DESC,
    CASE WHEN s.sort_mode = 'newest' THEN s.created_at END DESC,
    CASE WHEN s.sort_mode = 'rating' THEN s.rating_average END DESC,
    CASE WHEN s.sort_mode = 'rating' THEN s.review_count END DESC,
    s.updated_at DESC,
    s.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 60), 1), 200)
  OFFSET LEAST(GREATEST(COALESCE(_offset, 0), 0), 10000);
$$;

REVOKE ALL ON FUNCTION public.search_public_catalog_products_v2(
  text,
  text,
  numeric,
  numeric,
  boolean,
  boolean,
  numeric,
  text,
  integer,
  integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_catalog_products_v2(
  text,
  text,
  numeric,
  numeric,
  boolean,
  boolean,
  numeric,
  text,
  integer,
  integer
) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_public_catalog_products_v2(
  _limit integer DEFAULT 200,
  _offset integer DEFAULT 0
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
  rating_average numeric,
  review_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT *
  FROM public.search_public_catalog_products_v2(
    NULL,
    NULL,
    NULL,
    NULL,
    false,
    false,
    NULL,
    'newest',
    _limit,
    _offset
  );
$$;

REVOKE ALL ON FUNCTION public.list_public_catalog_products_v2(integer, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_catalog_products_v2(integer, integer)
TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003012500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
