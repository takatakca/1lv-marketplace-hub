-- Persistent account-backed saved lists and default wishlist.
-- Guest wishlist remains browser-local until an authorized TAKATAK session
-- exists, then product ids can be merged idempotently into the default list.

CREATE TABLE public.saved_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_lists_name_length CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  )
);

CREATE UNIQUE INDEX saved_lists_customer_name_unique
ON public.saved_lists (customer_id, lower(name));

CREATE UNIQUE INDEX saved_lists_one_default_per_customer
ON public.saved_lists (customer_id)
WHERE is_default = true;

CREATE TABLE public.saved_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.saved_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_list_items_unique UNIQUE (list_id, product_id)
);

CREATE INDEX saved_list_items_product_idx
ON public.saved_list_items (product_id, added_at DESC);

ALTER TABLE public.saved_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.saved_lists
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.saved_list_items
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

REVOKE ALL ON TABLE public.saved_lists
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.saved_list_items
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.saved_lists TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.saved_list_items TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_my_default_wishlist()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_list_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT id
  INTO v_list_id
  FROM public.saved_lists
  WHERE customer_id = v_user_id
    AND is_default = true
  LIMIT 1;

  IF v_list_id IS NULL THEN
    INSERT INTO public.saved_lists (
      customer_id,
      name,
      is_default
    )
    VALUES (
      v_user_id,
      'Wishlist',
      true
    )
    ON CONFLICT (customer_id) WHERE is_default = true
    DO UPDATE SET updated_at = now()
    RETURNING id INTO v_list_id;
  END IF;

  RETURN v_list_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_default_wishlist()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_default_wishlist()
TO authenticated;

CREATE OR REPLACE FUNCTION public.create_my_saved_list(
  _name text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(COALESCE(_name, ''));
  v_count integer;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  IF length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Saved list name must contain 1 to 80 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.saved_lists
  WHERE customer_id = v_user_id;

  IF v_count >= 50 THEN
    RAISE EXCEPTION 'Saved list limit reached'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.saved_lists (
    customer_id,
    name,
    is_default
  )
  VALUES (
    v_user_id,
    v_name,
    false
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_saved_list(text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_saved_list(text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.rename_my_saved_list(
  _list_id uuid,
  _name text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(COALESCE(_name, ''));
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  IF length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Saved list name must contain 1 to 80 characters'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.saved_lists
  SET
    name = v_name,
    updated_at = now()
  WHERE id = _list_id
    AND customer_id = v_user_id
    AND is_default = false;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_my_saved_list(uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_my_saved_list(uuid, text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_saved_list(
  _list_id uuid
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
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.saved_lists
  WHERE id = _list_id
    AND customer_id = v_user_id
    AND is_default = false;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_saved_list(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_saved_list(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_my_saved_list(
  _list_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_list_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  IF _list_id IS NULL THEN
    RETURN public.ensure_my_default_wishlist();
  END IF;

  SELECT id
  INTO v_list_id
  FROM public.saved_lists
  WHERE id = _list_id
    AND customer_id = v_user_id;

  IF v_list_id IS NULL THEN
    RAISE EXCEPTION 'Saved list not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_list_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_my_saved_list(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_my_saved_list(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_my_saved_product(
  _product_id uuid,
  _list_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_list_id uuid;
  v_existing uuid;
BEGIN
  v_list_id := public.resolve_my_saved_list(_list_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.products AS p
    JOIN public.vendors AS v ON v.id = p.vendor_id
    WHERE p.id = _product_id
      AND p.status = 'active'::public.product_status
      AND v.status = 'active'::public.vendor_status
      AND v.subscription_status IN ('active', 'trialing')
  ) THEN
    RAISE EXCEPTION 'Product is not available for saving'
      USING ERRCODE = '22023';
  END IF;

  SELECT id
  INTO v_existing
  FROM public.saved_list_items
  WHERE list_id = v_list_id
    AND product_id = _product_id;

  IF v_existing IS NULL THEN
    INSERT INTO public.saved_list_items (
      list_id,
      product_id
    )
    VALUES (
      v_list_id,
      _product_id
    );

    RETURN jsonb_build_object(
      'ok', true,
      'list_id', v_list_id,
      'product_id', _product_id,
      'saved', true
    );
  END IF;

  DELETE FROM public.saved_list_items
  WHERE id = v_existing;

  RETURN jsonb_build_object(
    'ok', true,
    'list_id', v_list_id,
    'product_id', _product_id,
    'saved', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_my_saved_product(uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_my_saved_product(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_guest_wishlist(
  _product_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_list_id uuid;
  v_added integer := 0;
BEGIN
  v_list_id := public.ensure_my_default_wishlist();

  IF cardinality(COALESCE(_product_ids, ARRAY[]::uuid[])) > 250 THEN
    RAISE EXCEPTION 'Guest wishlist merge is limited to 250 products'
      USING ERRCODE = '22023';
  END IF;

  WITH eligible AS (
    SELECT DISTINCT p.id
    FROM unnest(COALESCE(_product_ids, ARRAY[]::uuid[])) AS requested(product_id)
    JOIN public.products AS p ON p.id = requested.product_id
    JOIN public.vendors AS v ON v.id = p.vendor_id
    WHERE p.status = 'active'::public.product_status
      AND v.status = 'active'::public.vendor_status
      AND v.subscription_status IN ('active', 'trialing')
  ),
  inserted AS (
    INSERT INTO public.saved_list_items (
      list_id,
      product_id
    )
    SELECT v_list_id, e.id
    FROM eligible AS e
    ON CONFLICT (list_id, product_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer
  INTO v_added
  FROM inserted;

  RETURN jsonb_build_object(
    'ok', true,
    'list_id', v_list_id,
    'added', v_added
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_guest_wishlist(uuid[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_guest_wishlist(uuid[])
TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_my_saved_list(
  _list_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_list_id uuid;
  v_count integer;
BEGIN
  v_list_id := public.resolve_my_saved_list(_list_id);

  WITH deleted AS (
    DELETE FROM public.saved_list_items
    WHERE list_id = v_list_id
    RETURNING 1
  )
  SELECT count(*)::integer
  INTO v_count
  FROM deleted;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_my_saved_list(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_saved_list(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_saved_lists()
RETURNS TABLE (
  id uuid,
  name text,
  is_default boolean,
  item_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    sl.id,
    sl.name,
    sl.is_default,
    count(sli.id)::bigint AS item_count,
    sl.created_at,
    sl.updated_at
  FROM public.saved_lists AS sl
  LEFT JOIN public.saved_list_items AS sli
    ON sli.list_id = sl.id
  WHERE auth.uid() IS NOT NULL
    AND public.is_takatak_authorized_session()
    AND sl.customer_id = auth.uid()
  GROUP BY sl.id
  ORDER BY sl.is_default DESC, sl.created_at, sl.id;
$$;

REVOKE ALL ON FUNCTION public.list_my_saved_lists()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_saved_lists()
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_default_wishlist_ids()
RETURNS TABLE (
  product_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT sli.product_id
  FROM public.saved_lists AS sl
  JOIN public.saved_list_items AS sli
    ON sli.list_id = sl.id
  WHERE sl.customer_id = v_user_id
    AND sl.is_default = true
  ORDER BY sli.added_at DESC, sli.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_default_wishlist_ids()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_default_wishlist_ids()
TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_saved_products(
  _list_id uuid DEFAULT NULL,
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
  rating_average numeric,
  review_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  saved_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_list_id uuid;
BEGIN
  v_list_id := public.resolve_my_saved_list(_list_id);

  RETURN QUERY
  WITH sales AS (
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
  reviews AS (
    SELECT
      r.product_id,
      round(avg(r.rating)::numeric, 2) AS rating_average,
      count(*)::bigint AS review_count
    FROM public.product_reviews AS r
    WHERE r.status = 'published'::public.review_status
    GROUP BY r.product_id
  )
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
    COALESCE(r.rating_average, 0::numeric),
    COALESCE(r.review_count, 0)::bigint,
    p.created_at,
    p.updated_at,
    sli.added_at
  FROM public.saved_list_items AS sli
  JOIN public.products AS p ON p.id = sli.product_id
  JOIN public.vendors AS v
    ON v.id = p.vendor_id
   AND v.status = 'active'::public.vendor_status
   AND v.subscription_status IN ('active', 'trialing')
  LEFT JOIN sales AS s ON s.product_id = p.id
  LEFT JOIN reviews AS r ON r.product_id = p.id
  WHERE sli.list_id = v_list_id
    AND p.status = 'active'::public.product_status
    AND (NOT p.track_inventory OR p.inventory_quantity > 0)
  ORDER BY sli.added_at DESC, p.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_saved_products(uuid, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_saved_products(uuid, integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003044500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
