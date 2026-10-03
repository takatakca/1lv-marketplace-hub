-- Normalized marketplace product-variant foundation.
-- Product options, option values and SKU-level variants are authoritative 1LV data.
-- Browser clients receive curated projections only; vendor writes go through
-- TAKATAK-authorized ownership RPCs. Checkout integration is intentionally
-- separated into a later migration so this catalog layer can be certified first.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_id_vendor_id_key'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_id_vendor_id_key UNIQUE (id, vendor_id);
  END IF;
END
$$;

CREATE TABLE public.product_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_options_name_length CHECK (
    length(btrim(name)) BETWEEN 1 AND 60
  ),
  CONSTRAINT product_options_product_name_unique UNIQUE (product_id, name)
);

CREATE TABLE public.product_option_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id uuid NOT NULL REFERENCES public.product_options(id) ON DELETE CASCADE,
  value text NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_option_values_value_length CHECK (
    length(btrim(value)) BETWEEN 1 AND 100
  ),
  CONSTRAINT product_option_values_option_value_unique UNIQUE (option_id, value),
  CONSTRAINT product_option_values_id_option_unique UNIQUE (id, option_id)
);

CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  sku text NOT NULL,
  barcode text,
  price numeric(12,2) NOT NULL,
  compare_at_price numeric(12,2),
  cost numeric(12,2),
  inventory_quantity integer NOT NULL DEFAULT 0,
  track_inventory boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  option_signature text NOT NULL,
  image_url text,
  weight_grams integer,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_product_vendor_fkey
    FOREIGN KEY (product_id, vendor_id)
    REFERENCES public.products(id, vendor_id)
    ON DELETE CASCADE,
  CONSTRAINT product_variants_vendor_sku_unique UNIQUE (vendor_id, sku),
  CONSTRAINT product_variants_product_signature_unique
    UNIQUE (product_id, option_signature),
  CONSTRAINT product_variants_sku_format CHECK (
    sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'
  ),
  CONSTRAINT product_variants_barcode_length CHECK (
    barcode IS NULL OR length(barcode) BETWEEN 1 AND 64
  ),
  CONSTRAINT product_variants_price_positive CHECK (price > 0),
  CONSTRAINT product_variants_compare_price CHECK (
    compare_at_price IS NULL OR compare_at_price > price
  ),
  CONSTRAINT product_variants_cost_nonnegative CHECK (
    cost IS NULL OR cost >= 0
  ),
  CONSTRAINT product_variants_inventory_nonnegative CHECK (
    inventory_quantity >= 0
  ),
  CONSTRAINT product_variants_image_length CHECK (
    image_url IS NULL OR length(image_url) <= 2048
  ),
  CONSTRAINT product_variants_weight_nonnegative CHECK (
    weight_grams IS NULL OR weight_grams >= 0
  )
);

CREATE TABLE public.product_variant_option_values (
  variant_id uuid NOT NULL
    REFERENCES public.product_variants(id) ON DELETE CASCADE,
  option_id uuid NOT NULL
    REFERENCES public.product_options(id) ON DELETE CASCADE,
  option_value_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant_id, option_id),
  CONSTRAINT product_variant_option_value_unique
    UNIQUE (variant_id, option_value_id),
  CONSTRAINT product_variant_option_values_scope_fkey
    FOREIGN KEY (option_value_id, option_id)
    REFERENCES public.product_option_values(id, option_id)
    ON DELETE CASCADE
);

ALTER TABLE public.order_items
  ADD COLUMN variant_id uuid
    REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  ADD COLUMN variant_sku text,
  ADD COLUMN variant_options jsonb;

CREATE INDEX product_options_product_position_idx
ON public.product_options (product_id, position, id);

CREATE INDEX product_option_values_option_position_idx
ON public.product_option_values (option_id, position, id);

CREATE INDEX product_variants_public_lookup_idx
ON public.product_variants (product_id, active, position, id);

CREATE INDEX product_variants_inventory_idx
ON public.product_variants (product_id, inventory_quantity)
WHERE active = true AND track_inventory = true;

CREATE INDEX order_items_variant_id_idx
ON public.order_items (variant_id)
WHERE variant_id IS NOT NULL;

ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_option_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.product_options
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.product_option_values
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.product_variants
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.product_variant_option_values
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

REVOKE ALL ON TABLE public.product_options
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_option_values
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_variants
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_variant_option_values
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.product_options
TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.product_option_values
TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.product_variants
TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.product_variant_option_values
TO service_role;

CREATE OR REPLACE FUNCTION public.require_vendor_product_authority(
  _product_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_vendor_id uuid;
  v_owner_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK vendor session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.vendor_id, v.user_id
  INTO v_vendor_id, v_owner_id
  FROM public.products AS p
  JOIN public.vendors AS v ON v.id = p.vendor_id
  WHERE p.id = _product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_owner_id <> v_user_id
     AND NOT public.has_role(v_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Vendor cannot manage this product'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_vendor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.require_vendor_product_authority(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_vendor_product_authority(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_vendor_product_option(
  _product_id uuid,
  _option_id uuid,
  _name text,
  _position integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(COALESCE(_name, ''));
  v_id uuid;
BEGIN
  PERFORM public.require_vendor_product_authority(_product_id);

  IF length(v_name) NOT BETWEEN 1 AND 60
     OR COALESCE(_position, 0) < 0 THEN
    RAISE EXCEPTION 'Invalid product option'
      USING ERRCODE = '22023';
  END IF;

  IF _option_id IS NULL THEN
    INSERT INTO public.product_options (
      product_id,
      name,
      position
    )
    VALUES (
      _product_id,
      v_name,
      COALESCE(_position, 0)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.product_options
    SET
      name = v_name,
      position = COALESCE(_position, 0),
      updated_at = now()
    WHERE id = _option_id
      AND product_id = _product_id
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product option not found'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_vendor_product_option(
  uuid, uuid, text, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_vendor_product_option(
  uuid, uuid, text, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_vendor_product_option_value(
  _option_id uuid,
  _value_id uuid,
  _value text,
  _position integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id uuid;
  v_value text := btrim(COALESCE(_value, ''));
  v_id uuid;
BEGIN
  SELECT product_id
  INTO v_product_id
  FROM public.product_options
  WHERE id = _option_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product option not found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.require_vendor_product_authority(v_product_id);

  IF length(v_value) NOT BETWEEN 1 AND 100
     OR COALESCE(_position, 0) < 0 THEN
    RAISE EXCEPTION 'Invalid product option value'
      USING ERRCODE = '22023';
  END IF;

  IF _value_id IS NULL THEN
    INSERT INTO public.product_option_values (
      option_id,
      value,
      position
    )
    VALUES (
      _option_id,
      v_value,
      COALESCE(_position, 0)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.product_option_values
    SET
      value = v_value,
      position = COALESCE(_position, 0),
      updated_at = now()
    WHERE id = _value_id
      AND option_id = _option_id
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product option value not found'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_vendor_product_option_value(
  uuid, uuid, text, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_vendor_product_option_value(
  uuid, uuid, text, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_vendor_product_variant(
  _product_id uuid,
  _variant_id uuid,
  _sku text,
  _price numeric,
  _compare_at_price numeric DEFAULT NULL,
  _cost numeric DEFAULT NULL,
  _inventory_quantity integer DEFAULT 0,
  _track_inventory boolean DEFAULT true,
  _active boolean DEFAULT true,
  _option_value_ids uuid[] DEFAULT ARRAY[]::uuid[],
  _barcode text DEFAULT NULL,
  _image_url text DEFAULT NULL,
  _weight_grams integer DEFAULT NULL,
  _position integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor_id uuid;
  v_variant_id uuid;
  v_sku text := upper(btrim(COALESCE(_sku, '')));
  v_barcode text := NULLIF(btrim(COALESCE(_barcode, '')), '');
  v_image_url text := NULLIF(btrim(COALESCE(_image_url, '')), '');
  v_option_count integer;
  v_value_count integer;
  v_distinct_option_count integer;
  v_signature text;
BEGIN
  v_vendor_id := public.require_vendor_product_authority(_product_id);

  IF v_sku !~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'
     OR _price IS NULL
     OR _price <= 0
     OR (_compare_at_price IS NOT NULL AND _compare_at_price <= _price)
     OR (_cost IS NOT NULL AND _cost < 0)
     OR COALESCE(_inventory_quantity, 0) < 0
     OR (_weight_grams IS NOT NULL AND _weight_grams < 0)
     OR COALESCE(_position, 0) < 0
     OR (v_barcode IS NOT NULL AND length(v_barcode) > 64)
     OR (v_image_url IS NOT NULL AND length(v_image_url) > 2048) THEN
    RAISE EXCEPTION 'Invalid product variant'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO v_option_count
  FROM public.product_options
  WHERE product_id = _product_id;

  SELECT
    count(DISTINCT provided.value_id),
    count(DISTINCT pov.option_id)
  INTO
    v_value_count,
    v_distinct_option_count
  FROM unnest(COALESCE(_option_value_ids, ARRAY[]::uuid[])) AS provided(value_id)
  LEFT JOIN public.product_option_values AS pov
    ON pov.id = provided.value_id
  LEFT JOIN public.product_options AS po
    ON po.id = pov.option_id
   AND po.product_id = _product_id
  WHERE po.id IS NOT NULL;

  IF cardinality(COALESCE(_option_value_ids, ARRAY[]::uuid[])) <> v_value_count
     OR v_value_count <> v_distinct_option_count
     OR v_value_count <> v_option_count THEN
    RAISE EXCEPTION
      'Variant must select exactly one valid value for every product option'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    string_agg(pov.id::text, ':' ORDER BY po.position, po.id),
    'default'
  )
  INTO v_signature
  FROM public.product_options AS po
  JOIN public.product_option_values AS pov
    ON pov.option_id = po.id
  WHERE po.product_id = _product_id
    AND pov.id = ANY(COALESCE(_option_value_ids, ARRAY[]::uuid[]));

  IF _variant_id IS NULL THEN
    INSERT INTO public.product_variants (
      product_id,
      vendor_id,
      sku,
      barcode,
      price,
      compare_at_price,
      cost,
      inventory_quantity,
      track_inventory,
      active,
      option_signature,
      image_url,
      weight_grams,
      position
    )
    VALUES (
      _product_id,
      v_vendor_id,
      v_sku,
      v_barcode,
      round(_price, 2),
      CASE
        WHEN _compare_at_price IS NULL THEN NULL
        ELSE round(_compare_at_price, 2)
      END,
      CASE WHEN _cost IS NULL THEN NULL ELSE round(_cost, 2) END,
      COALESCE(_inventory_quantity, 0),
      COALESCE(_track_inventory, true),
      COALESCE(_active, true),
      v_signature,
      v_image_url,
      _weight_grams,
      COALESCE(_position, 0)
    )
    RETURNING id INTO v_variant_id;
  ELSE
    UPDATE public.product_variants
    SET
      sku = v_sku,
      barcode = v_barcode,
      price = round(_price, 2),
      compare_at_price = CASE
        WHEN _compare_at_price IS NULL THEN NULL
        ELSE round(_compare_at_price, 2)
      END,
      cost = CASE WHEN _cost IS NULL THEN NULL ELSE round(_cost, 2) END,
      inventory_quantity = COALESCE(_inventory_quantity, 0),
      track_inventory = COALESCE(_track_inventory, true),
      active = COALESCE(_active, true),
      option_signature = v_signature,
      image_url = v_image_url,
      weight_grams = _weight_grams,
      position = COALESCE(_position, 0),
      updated_at = now()
    WHERE id = _variant_id
      AND product_id = _product_id
      AND vendor_id = v_vendor_id
    RETURNING id INTO v_variant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product variant not found'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  DELETE FROM public.product_variant_option_values
  WHERE variant_id = v_variant_id;

  INSERT INTO public.product_variant_option_values (
    variant_id,
    option_id,
    option_value_id
  )
  SELECT
    v_variant_id,
    pov.option_id,
    pov.id
  FROM public.product_option_values AS pov
  JOIN public.product_options AS po
    ON po.id = pov.option_id
   AND po.product_id = _product_id
  WHERE pov.id = ANY(COALESCE(_option_value_ids, ARRAY[]::uuid[]));

  RETURN jsonb_build_object(
    'ok', true,
    'variant_id', v_variant_id,
    'product_id', _product_id,
    'sku', v_sku,
    'option_signature', v_signature
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_vendor_product_variant(
  uuid, uuid, text, numeric, numeric, numeric, integer, boolean, boolean,
  uuid[], text, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_vendor_product_variant(
  uuid, uuid, text, numeric, numeric, numeric, integer, boolean, boolean,
  uuid[], text, text, integer, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_vendor_product_variant(
  _variant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  SELECT product_id
  INTO v_product_id
  FROM public.product_variants
  WHERE id = _variant_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM public.require_vendor_product_authority(v_product_id);

  UPDATE public.product_variants
  SET
    active = false,
    updated_at = now()
  WHERE id = _variant_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_vendor_product_variant(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_vendor_product_variant(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vendor_product_variant_matrix(
  _product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_vendor_product_authority(_product_id);

  RETURN jsonb_build_object(
    'options',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', po.id,
          'name', po.name,
          'position', po.position,
          'values', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', pov.id,
                'value', pov.value,
                'position', pov.position
              )
              ORDER BY pov.position, pov.id
            )
            FROM public.product_option_values AS pov
            WHERE pov.option_id = po.id
          ), '[]'::jsonb)
        )
        ORDER BY po.position, po.id
      )
      FROM public.product_options AS po
      WHERE po.product_id = _product_id
    ), '[]'::jsonb),
    'variants',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pv.id,
          'sku', pv.sku,
          'barcode', pv.barcode,
          'price', pv.price,
          'compare_at_price', pv.compare_at_price,
          'cost', pv.cost,
          'inventory_quantity', pv.inventory_quantity,
          'track_inventory', pv.track_inventory,
          'active', pv.active,
          'image_url', pv.image_url,
          'weight_grams', pv.weight_grams,
          'position', pv.position,
          'attributes', COALESCE((
            SELECT jsonb_object_agg(po.name, pov.value ORDER BY po.position)
            FROM public.product_variant_option_values AS pvov
            JOIN public.product_options AS po
              ON po.id = pvov.option_id
            JOIN public.product_option_values AS pov
              ON pov.id = pvov.option_value_id
            WHERE pvov.variant_id = pv.id
          ), '{}'::jsonb)
        )
        ORDER BY pv.position, pv.id
      )
      FROM public.product_variants AS pv
      WHERE pv.product_id = _product_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_product_variant_matrix(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_product_variant_matrix(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_product_variant_matrix(
  _product_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'options',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', po.id,
          'name', po.name,
          'position', po.position,
          'values', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', pov.id,
                'value', pov.value,
                'position', pov.position
              )
              ORDER BY pov.position, pov.id
            )
            FROM public.product_option_values AS pov
            WHERE pov.option_id = po.id
              AND EXISTS (
                SELECT 1
                FROM public.product_variant_option_values AS pvov
                JOIN public.product_variants AS pv
                  ON pv.id = pvov.variant_id
                WHERE pvov.option_value_id = pov.id
                  AND pv.product_id = _product_id
                  AND pv.active = true
              )
          ), '[]'::jsonb)
        )
        ORDER BY po.position, po.id
      )
      FROM public.product_options AS po
      WHERE po.product_id = _product_id
    ), '[]'::jsonb),
    'variants',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pv.id,
          'sku', pv.sku,
          'price', pv.price,
          'compare_at_price', pv.compare_at_price,
          'available',
            (NOT pv.track_inventory OR pv.inventory_quantity > 0),
          'low_stock',
            (pv.track_inventory AND pv.inventory_quantity BETWEEN 1 AND 5),
          'image_url', pv.image_url,
          'weight_grams', pv.weight_grams,
          'position', pv.position,
          'attributes', COALESCE((
            SELECT jsonb_object_agg(po.name, pov.value ORDER BY po.position)
            FROM public.product_variant_option_values AS pvov
            JOIN public.product_options AS po
              ON po.id = pvov.option_id
            JOIN public.product_option_values AS pov
              ON pov.id = pvov.option_value_id
            WHERE pvov.variant_id = pv.id
          ), '{}'::jsonb)
        )
        ORDER BY pv.position, pv.id
      )
      FROM public.product_variants AS pv
      WHERE pv.product_id = _product_id
        AND pv.active = true
    ), '[]'::jsonb)
  )
  FROM public.products AS p
  JOIN public.vendors AS v
    ON v.id = p.vendor_id
   AND v.status = 'active'::public.vendor_status
   AND v.subscription_status IN ('active', 'trialing')
  WHERE p.id = _product_id
    AND p.status = 'active'::public.product_status;
$$;

REVOKE ALL ON FUNCTION public.get_public_product_variant_matrix(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_product_variant_matrix(uuid)
TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003020000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
