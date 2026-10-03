-- Account-backed persistent cart with guest merge.
-- Cart state stores purchase intent only. Price, inventory and checkout totals
-- remain authoritative in the existing checkout engine.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.product_variants'::regclass
      AND conname = 'product_variants_id_product_unique'
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_id_product_unique
      UNIQUE (id, product_id);
  END IF;
END
$$;

CREATE TABLE public.customer_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_cart_variant_product_fkey
    FOREIGN KEY (variant_id, product_id)
    REFERENCES public.product_variants(id, product_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX customer_cart_parent_line_unique
ON public.customer_cart_items (customer_id, product_id)
WHERE variant_id IS NULL;

CREATE UNIQUE INDEX customer_cart_variant_line_unique
ON public.customer_cart_items (customer_id, variant_id)
WHERE variant_id IS NOT NULL;

CREATE INDEX customer_cart_customer_updated_idx
ON public.customer_cart_items (customer_id, updated_at DESC, id);

ALTER TABLE public.customer_cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.customer_cart_items
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

REVOKE ALL ON TABLE public.customer_cart_items
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.customer_cart_items TO service_role;

CREATE OR REPLACE FUNCTION public.require_my_cart_session()
RETURNS uuid
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

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.require_my_cart_session()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_my_cart_session()
TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_cart_target_quantity(
  _product_id uuid,
  _variant_id uuid,
  _requested_quantity integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_vendor public.vendors%ROWTYPE;
  v_max integer := 99;
BEGIN
  IF _product_id IS NULL
     OR _requested_quantity IS NULL
     OR _requested_quantity < 1
     OR _requested_quantity > 99 THEN
    RAISE EXCEPTION 'Cart quantity must be between 1 and 99'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.*, v.*
  INTO v_product, v_vendor
  FROM public.products AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.id = _product_id;

  IF NOT FOUND
     OR v_product.status <> 'active'::public.product_status
     OR v_vendor.status <> 'active'::public.vendor_status
     OR v_vendor.subscription_status NOT IN ('active', 'trialing') THEN
    RAISE EXCEPTION 'Product is not currently cart-eligible'
      USING ERRCODE = '22023';
  END IF;

  IF _variant_id IS NOT NULL THEN
    SELECT *
    INTO v_variant
    FROM public.product_variants
    WHERE id = _variant_id
      AND product_id = _product_id
      AND vendor_id = v_product.vendor_id
      AND active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected product variant is not cart-eligible'
        USING ERRCODE = '22023';
    END IF;

    IF v_variant.track_inventory THEN
      v_max := LEAST(99, v_variant.inventory_quantity);
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.product_variants
      WHERE product_id = _product_id
        AND active = true
    ) THEN
      RAISE EXCEPTION 'A product variant must be selected'
        USING ERRCODE = '22023';
    END IF;

    IF v_product.track_inventory THEN
      v_max := LEAST(99, v_product.inventory_quantity);
    END IF;
  END IF;

  IF v_max < 1 THEN
    RAISE EXCEPTION 'Product is currently out of stock'
      USING ERRCODE = '22023';
  END IF;

  RETURN LEAST(_requested_quantity, v_max);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_cart_target_quantity(
  uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_cart_target_quantity(
  uuid, uuid, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_cart_item(
  _product_id uuid,
  _variant_id uuid,
  _quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_quantity integer;
  v_item_id uuid;
  v_lock_key text;
BEGIN
  v_user_id := public.require_my_cart_session();

  IF _product_id IS NULL OR _quantity IS NULL OR _quantity < 0 OR _quantity > 99 THEN
    RAISE EXCEPTION 'Cart item requires product and quantity from 0 to 99'
      USING ERRCODE = '22023';
  END IF;

  v_lock_key :=
    v_user_id::text || ':' ||
    _product_id::text || ':' ||
    COALESCE(_variant_id::text, 'parent');

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_lock_key, 54117)
  );

  IF _quantity = 0 THEN
    DELETE FROM public.customer_cart_items
    WHERE customer_id = v_user_id
      AND product_id = _product_id
      AND variant_id IS NOT DISTINCT FROM _variant_id;

    RETURN jsonb_build_object(
      'ok', true,
      'product_id', _product_id,
      'variant_id', _variant_id,
      'quantity', 0,
      'removed', true
    );
  END IF;

  v_quantity := public.resolve_cart_target_quantity(
    _product_id,
    _variant_id,
    _quantity
  );

  SELECT id
  INTO v_item_id
  FROM public.customer_cart_items
  WHERE customer_id = v_user_id
    AND product_id = _product_id
    AND variant_id IS NOT DISTINCT FROM _variant_id
  FOR UPDATE;

  IF v_item_id IS NULL THEN
    INSERT INTO public.customer_cart_items (
      customer_id,
      product_id,
      variant_id,
      quantity
    )
    VALUES (
      v_user_id,
      _product_id,
      _variant_id,
      v_quantity
    )
    RETURNING id INTO v_item_id;
  ELSE
    UPDATE public.customer_cart_items
    SET
      quantity = v_quantity,
      updated_at = now()
    WHERE id = v_item_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'cart_item_id', v_item_id,
    'product_id', _product_id,
    'variant_id', _variant_id,
    'quantity', v_quantity,
    'removed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_cart_item(
  uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_cart_item(
  uuid, uuid, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_guest_cart(
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_item record;
  v_existing integer;
  v_requested integer;
  v_final integer;
  v_item_id uuid;
  v_merged integer := 0;
BEGIN
  v_user_id := public.require_my_cart_session();

  IF _items IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Guest cart merge is limited to 100 lines'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_items) AS entry
    WHERE COALESCE(entry->>'product_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (
        COALESCE(entry->>'variant_id', '') <> ''
        AND COALESCE(entry->>'variant_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      OR COALESCE(entry->>'quantity', '') !~ '^[1-9][0-9]?$'
  ) THEN
    RAISE EXCEPTION 'Invalid guest cart line'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT
      (entry->>'product_id')::uuid AS product_id,
      NULLIF(entry->>'variant_id', '')::uuid AS variant_id,
      LEAST(99, sum((entry->>'quantity')::integer)::integer) AS quantity
    FROM jsonb_array_elements(_items) AS entry
    GROUP BY
      (entry->>'product_id')::uuid,
      NULLIF(entry->>'variant_id', '')::uuid
    ORDER BY
      (entry->>'product_id')::uuid,
      NULLIF(entry->>'variant_id', '')::uuid NULLS FIRST
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        v_user_id::text || ':' ||
        v_item.product_id::text || ':' ||
        COALESCE(v_item.variant_id::text, 'parent'),
        54117
      )
    );

    SELECT id, quantity
    INTO v_item_id, v_existing
    FROM public.customer_cart_items
    WHERE customer_id = v_user_id
      AND product_id = v_item.product_id
      AND variant_id IS NOT DISTINCT FROM v_item.variant_id
    FOR UPDATE;

    v_requested := LEAST(99, COALESCE(v_existing, 0) + v_item.quantity);

    BEGIN
      v_final := public.resolve_cart_target_quantity(
        v_item.product_id,
        v_item.variant_id,
        v_requested
      );
    EXCEPTION
      WHEN SQLSTATE '22023' THEN
        CONTINUE;
    END;

    IF v_item_id IS NULL THEN
      INSERT INTO public.customer_cart_items (
        customer_id,
        product_id,
        variant_id,
        quantity
      )
      VALUES (
        v_user_id,
        v_item.product_id,
        v_item.variant_id,
        v_final
      );
    ELSE
      UPDATE public.customer_cart_items
      SET
        quantity = v_final,
        updated_at = now()
      WHERE id = v_item_id;
    END IF;

    v_merged := v_merged + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'merged_lines', v_merged
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_guest_cart(jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_guest_cart(jsonb)
TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_my_cart()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_deleted integer;
BEGIN
  v_user_id := public.require_my_cart_session();

  DELETE FROM public.customer_cart_items
  WHERE customer_id = v_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_my_cart()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_cart()
TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_cart_items()
RETURNS TABLE (
  product_id uuid,
  variant_id uuid,
  slug text,
  title text,
  vendor_slug text,
  unit_price numeric,
  image_url text,
  variant_sku text,
  variant_options jsonb,
  quantity integer,
  available boolean,
  max_quantity integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := public.require_my_cart_session();

  RETURN QUERY
  SELECT
    ci.product_id,
    ci.variant_id,
    p.slug,
    p.title,
    v.slug,
    COALESCE(pv.price, p.price) AS unit_price,
    COALESCE(
      pv.image_url,
      CASE
        WHEN jsonb_typeof(p.images) = 'array'
          AND jsonb_array_length(p.images) > 0
        THEN p.images->>0
        ELSE NULL
      END
    ) AS image_url,
    pv.sku,
    CASE
      WHEN pv.id IS NULL THEN NULL
      ELSE COALESCE((
        SELECT jsonb_object_agg(po.name, pov.value ORDER BY po.position)
        FROM public.product_variant_option_values AS pvov
        JOIN public.product_options AS po
          ON po.id = pvov.option_id
        JOIN public.product_option_values AS pov
          ON pov.id = pvov.option_value_id
        WHERE pvov.variant_id = pv.id
      ), '{}'::jsonb)
    END AS variant_options,
    ci.quantity,
    (
      p.status = 'active'::public.product_status
      AND v.status = 'active'::public.vendor_status
      AND v.subscription_status IN ('active', 'trialing')
      AND (
        CASE
          WHEN ci.variant_id IS NOT NULL THEN
            pv.id IS NOT NULL
            AND pv.active = true
            AND (NOT pv.track_inventory OR pv.inventory_quantity > 0)
          ELSE
            NOT EXISTS (
              SELECT 1
              FROM public.product_variants AS child
              WHERE child.product_id = p.id
                AND child.active = true
            )
            AND (NOT p.track_inventory OR p.inventory_quantity > 0)
        END
      )
    ) AS available,
    CASE
      WHEN ci.variant_id IS NOT NULL THEN
        CASE
          WHEN COALESCE(pv.track_inventory, true)
            THEN LEAST(99, GREATEST(COALESCE(pv.inventory_quantity, 0), 0))
          ELSE 99
        END
      ELSE
        CASE
          WHEN p.track_inventory
            THEN LEAST(99, GREATEST(p.inventory_quantity, 0))
          ELSE 99
        END
    END AS max_quantity,
    ci.updated_at
  FROM public.customer_cart_items AS ci
  JOIN public.products AS p ON p.id = ci.product_id
  JOIN public.vendors AS v ON v.id = p.vendor_id
  LEFT JOIN public.product_variants AS pv
    ON pv.id = ci.variant_id
   AND pv.product_id = ci.product_id
  WHERE ci.customer_id = v_user_id
  ORDER BY ci.created_at, ci.id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_cart_items()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_cart_items()
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003064500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
