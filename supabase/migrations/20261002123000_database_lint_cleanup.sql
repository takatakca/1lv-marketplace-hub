-- Clean up the final database lint warnings without changing checkout behavior.
-- 1) normalize_canadian_checkout_address is STABLE, not IMMUTABLE.
-- 2) create_marketplace_order_locked_unchecked no longer declares/loads an unused order id.

ALTER FUNCTION public.normalize_canadian_checkout_address(jsonb, text)
STABLE;

CREATE OR REPLACE FUNCTION public.create_marketplace_order_locked_unchecked(
  _customer_id uuid,
  _customer_email text,
  _customer_phone text,
  _shipping_address jsonb,
  _billing_address jsonb,
  _items jsonb,
  _idempotency_key uuid,
  _promotion_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_product_id uuid;
  v_idempotency_hash text;
  v_request_hash text;
  v_existing_request_hash text;
  v_result jsonb;
  v_result_order_id uuid;
  v_normalized_items jsonb;
BEGIN
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Invalid checkout idempotency key'
      USING ERRCODE = '22023';
  END IF;

  v_idempotency_hash := encode(
    extensions.digest(
      convert_to(_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_idempotency_hash, 0)
  );

  IF _items IS NOT NULL
     AND jsonb_typeof(_items) = 'array'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(_items) AS entry
       WHERE COALESCE(entry->>'product_id', '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR COALESCE(entry->>'quantity', '') !~ '^[0-9]+$'
     ) THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'product_id', product_id,
        'quantity', quantity
      )
      ORDER BY product_id
    )
    INTO v_normalized_items
    FROM (
      SELECT
        (entry->>'product_id')::uuid AS product_id,
        sum((entry->>'quantity')::integer)::integer AS quantity
      FROM jsonb_array_elements(_items) AS entry
      GROUP BY (entry->>'product_id')::uuid
    ) AS normalized;
  ELSE
    v_normalized_items := _items;
  END IF;

  v_request_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'customer_id', _customer_id,
          'customer_email', lower(btrim(COALESCE(_customer_email, ''))),
          'customer_phone', NULLIF(btrim(COALESCE(_customer_phone, '')), ''),
          'shipping_address', _shipping_address,
          'billing_address', _billing_address,
          'items', v_normalized_items,
          'promotion_code',
            NULLIF(upper(btrim(COALESCE(_promotion_code, ''))), '')
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  SELECT checkout_request_hash
  INTO v_existing_request_hash
  FROM public.orders
  WHERE checkout_idempotency_hash = v_idempotency_hash
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_request_hash IS NULL THEN
      RAISE EXCEPTION 'Checkout idempotency key predates payload binding; please submit again'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing_request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'Checkout idempotency key conflict'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF _items IS NOT NULL AND jsonb_typeof(_items) = 'array' THEN
    FOR v_product_id IN
      SELECT DISTINCT (entry->>'product_id')::uuid
      FROM jsonb_array_elements(_items) AS entry
      WHERE COALESCE(entry->>'product_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ORDER BY 1
    LOOP
      PERFORM pg_advisory_xact_lock(
        hashtextextended(v_product_id::text, 42117)
      );
    END LOOP;
  END IF;

  v_result := public.create_marketplace_order(
    _customer_id,
    _customer_email,
    _customer_phone,
    _shipping_address,
    _billing_address,
    _items,
    _idempotency_key,
    _promotion_code
  );

  v_result_order_id := NULLIF(v_result->>'order_id', '')::uuid;
  IF v_result_order_id IS NULL THEN
    RAISE EXCEPTION 'Checkout did not return an order id'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orders
  SET checkout_request_hash = v_request_hash
  WHERE id = v_result_order_id
    AND checkout_request_hash IS NULL;

  SELECT checkout_request_hash
  INTO v_existing_request_hash
  FROM public.orders
  WHERE id = v_result_order_id
  FOR UPDATE;

  IF v_existing_request_hash IS DISTINCT FROM v_request_hash THEN
    RAISE EXCEPTION 'Checkout request fingerprint mismatch'
      USING ERRCODE = '23505';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order_locked_unchecked(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_marketplace_order_locked_unchecked(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002123000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
