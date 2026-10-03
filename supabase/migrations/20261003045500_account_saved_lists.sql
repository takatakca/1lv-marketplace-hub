-- Account-backed wishlist and saved lists.
-- Guests may keep a temporary browser wishlist, but authenticated TAKATAK
-- sessions persist saved products in 1LV and remain isolated by customer id.

CREATE TABLE public.customer_saved_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_saved_lists_name_length CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  )
);

CREATE UNIQUE INDEX customer_saved_lists_customer_name_unique
ON public.customer_saved_lists (customer_id, lower(name));

CREATE UNIQUE INDEX customer_saved_lists_one_default
ON public.customer_saved_lists (customer_id)
WHERE is_default = true;

CREATE INDEX customer_saved_lists_customer_created_idx
ON public.customer_saved_lists (customer_id, created_at, id);

CREATE TABLE public.customer_saved_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL
    REFERENCES public.customer_saved_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL
    REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_saved_list_items_unique
    UNIQUE (list_id, product_id)
);

CREATE INDEX customer_saved_list_items_product_idx
ON public.customer_saved_list_items (product_id);

ALTER TABLE public.customer_saved_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_saved_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.customer_saved_lists
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.customer_saved_list_items
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

REVOKE ALL ON TABLE public.customer_saved_lists
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customer_saved_list_items
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.customer_saved_lists TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.customer_saved_list_items TO service_role;

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

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::text, 53117)
  );

  SELECT id
  INTO v_list_id
  FROM public.customer_saved_lists
  WHERE customer_id = v_user_id
    AND is_default = true
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;

  IF v_list_id IS NULL THEN
    INSERT INTO public.customer_saved_lists (
      customer_id,
      name,
      is_default
    )
    VALUES (
      v_user_id,
      'Wishlist',
      true
    )
    RETURNING id INTO v_list_id;
  END IF;

  RETURN v_list_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_default_wishlist()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_default_wishlist()
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
    l.id,
    l.name,
    l.is_default,
    count(i.id)::bigint AS item_count,
    l.created_at,
    l.updated_at
  FROM public.customer_saved_lists AS l
  LEFT JOIN public.customer_saved_list_items AS i
    ON i.list_id = l.id
  WHERE auth.uid() IS NOT NULL
    AND public.is_takatak_authorized_session()
    AND l.customer_id = auth.uid()
  GROUP BY l.id
  ORDER BY l.is_default DESC, l.created_at, l.id;
$$;

REVOKE ALL ON FUNCTION public.list_my_saved_lists()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_saved_lists()
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_wishlist_product_ids()
RETURNS TABLE (
  product_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    i.product_id,
    i.created_at
  FROM public.customer_saved_lists AS l
  JOIN public.customer_saved_list_items AS i
    ON i.list_id = l.id
  WHERE auth.uid() IS NOT NULL
    AND public.is_takatak_authorized_session()
    AND l.customer_id = auth.uid()
    AND l.is_default = true
  ORDER BY i.created_at, i.id;
$$;

REVOKE ALL ON FUNCTION public.get_my_wishlist_product_ids()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_wishlist_product_ids()
TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_wishlist_product(
  _product_id uuid,
  _saved boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_list_id uuid;
BEGIN
  IF _product_id IS NULL OR _saved IS NULL THEN
    RAISE EXCEPTION 'Product and saved state are required'
      USING ERRCODE = '22023';
  END IF;

  v_list_id := public.ensure_my_default_wishlist();

  IF _saved THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.products AS p
      JOIN public.vendors AS v ON v.id = p.vendor_id
      WHERE p.id = _product_id
        AND p.status = 'active'::public.product_status
        AND v.status = 'active'::public.vendor_status
        AND v.subscription_status IN ('active', 'trialing')
    ) THEN
      RAISE EXCEPTION 'Product is not currently saveable'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.customer_saved_list_items (
      list_id,
      product_id
    )
    VALUES (
      v_list_id,
      _product_id
    )
    ON CONFLICT (list_id, product_id) DO NOTHING;
  ELSE
    DELETE FROM public.customer_saved_list_items
    WHERE list_id = v_list_id
      AND product_id = _product_id;
  END IF;

  UPDATE public.customer_saved_lists
  SET updated_at = now()
  WHERE id = v_list_id;

  RETURN _saved;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_wishlist_product(uuid, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_wishlist_product(uuid, boolean)
TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_my_wishlist_products(
  _product_ids uuid[]
)
RETURNS uuid[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_list_id uuid;
  v_result uuid[];
  v_count integer;
BEGIN
  v_list_id := public.ensure_my_default_wishlist();

  v_count := COALESCE(cardinality(_product_ids), 0);
  IF v_count > 500 THEN
    RAISE EXCEPTION 'Wishlist merge is limited to 500 products'
      USING ERRCODE = '22023';
  END IF;

  IF v_count > 0 THEN
    INSERT INTO public.customer_saved_list_items (
      list_id,
      product_id
    )
    SELECT
      v_list_id,
      p.id
    FROM (
      SELECT DISTINCT product_id
      FROM unnest(_product_ids) AS candidate(product_id)
      WHERE product_id IS NOT NULL
    ) AS candidate
    JOIN public.products AS p ON p.id = candidate.product_id
    JOIN public.vendors AS v ON v.id = p.vendor_id
    WHERE p.status = 'active'::public.product_status
      AND v.status = 'active'::public.vendor_status
      AND v.subscription_status IN ('active', 'trialing')
    ON CONFLICT (list_id, product_id) DO NOTHING;
  END IF;

  UPDATE public.customer_saved_lists
  SET updated_at = now()
  WHERE id = v_list_id;

  SELECT COALESCE(
    array_agg(i.product_id ORDER BY i.created_at, i.id),
    ARRAY[]::uuid[]
  )
  INTO v_result
  FROM public.customer_saved_list_items AS i
  WHERE i.list_id = v_list_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_my_wishlist_products(uuid[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_my_wishlist_products(uuid[])
TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_my_wishlist()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_list_id uuid;
  v_deleted integer;
BEGIN
  v_list_id := public.ensure_my_default_wishlist();

  DELETE FROM public.customer_saved_list_items
  WHERE list_id = v_list_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.customer_saved_lists
  SET updated_at = now()
  WHERE id = v_list_id;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_my_wishlist()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_wishlist()
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
  v_list_id uuid;
  v_list_count integer;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  IF length(v_name) NOT BETWEEN 1 AND 80
     OR lower(v_name) = 'wishlist' THEN
    RAISE EXCEPTION 'Invalid saved list name'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_list_count
  FROM public.customer_saved_lists
  WHERE customer_id = v_user_id;

  IF v_list_count >= 50 THEN
    RAISE EXCEPTION 'Saved list limit reached'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.customer_saved_lists (
    customer_id,
    name,
    is_default
  )
  VALUES (
    v_user_id,
    v_name,
    false
  )
  RETURNING id INTO v_list_id;

  RETURN v_list_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_saved_list(text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_saved_list(text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_saved_list_product(
  _list_id uuid,
  _product_id uuid,
  _saved boolean
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

  IF _list_id IS NULL OR _product_id IS NULL OR _saved IS NULL THEN
    RAISE EXCEPTION 'List, product and saved state are required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_saved_lists
    WHERE id = _list_id
      AND customer_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Saved list not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  IF _saved THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.products AS p
      JOIN public.vendors AS v ON v.id = p.vendor_id
      WHERE p.id = _product_id
        AND p.status = 'active'::public.product_status
        AND v.status = 'active'::public.vendor_status
        AND v.subscription_status IN ('active', 'trialing')
    ) THEN
      RAISE EXCEPTION 'Product is not currently saveable'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.customer_saved_list_items (
      list_id,
      product_id
    )
    VALUES (_list_id, _product_id)
    ON CONFLICT (list_id, product_id) DO NOTHING;
  ELSE
    DELETE FROM public.customer_saved_list_items
    WHERE list_id = _list_id
      AND product_id = _product_id;
  END IF;

  UPDATE public.customer_saved_lists
  SET updated_at = now()
  WHERE id = _list_id;

  RETURN _saved;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_saved_list_product(
  uuid, uuid, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_saved_list_product(
  uuid, uuid, boolean
) TO authenticated;

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

  DELETE FROM public.customer_saved_lists
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

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003045500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
