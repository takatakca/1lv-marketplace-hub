-- Validate checkout JSON before any UUID/integer cast.
-- This converts malformed/oversized cart input into deterministic validation
-- errors instead of raw PostgreSQL cast/overflow failures.

ALTER FUNCTION public.create_marketplace_order(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
)
RENAME TO create_marketplace_order_unchecked;

ALTER FUNCTION public.create_marketplace_order_locked(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
)
RENAME TO create_marketplace_order_locked_unchecked;

CREATE OR REPLACE FUNCTION public.assert_checkout_items_safe(_items jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF _items IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Checkout must contain between 1 and 100 items'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_items) AS entry
    WHERE COALESCE(entry->>'product_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(entry->>'quantity', '') !~ '^[1-9][0-9]?$'
  ) THEN
    RAISE EXCEPTION 'Each checkout item must have a valid product and quantity'
      USING ERRCODE = '22023';
  END IF;

  -- Every individual quantity is now known to be 1..99, so these casts cannot
  -- overflow. Reject duplicate lines whose combined product quantity exceeds 99.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_items) AS entry
    GROUP BY (entry->>'product_id')::uuid
    HAVING sum((entry->>'quantity')::integer) > 99
  ) THEN
    RAISE EXCEPTION 'Combined product quantity must be between 1 and 99'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_checkout_items_safe(jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_checkout_items_safe(jsonb)
TO service_role;

CREATE OR REPLACE FUNCTION public.create_marketplace_order(
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
BEGIN
  PERFORM public.assert_checkout_items_safe(_items);

  RETURN public.create_marketplace_order_unchecked(
    _customer_id,
    _customer_email,
    _customer_phone,
    _shipping_address,
    _billing_address,
    _items,
    _idempotency_key,
    _promotion_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
) TO service_role;

CREATE OR REPLACE FUNCTION public.create_marketplace_order_locked(
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
BEGIN
  PERFORM public.assert_checkout_items_safe(_items);

  RETURN public.create_marketplace_order_locked_unchecked(
    _customer_id,
    _customer_email,
    _customer_phone,
    _shipping_address,
    _billing_address,
    _items,
    _idempotency_key,
    _promotion_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order_locked(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_locked(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
) TO service_role;

-- The renamed implementation functions remain service-role-only because the
-- canonical SECURITY INVOKER wrappers execute under that role.
REVOKE ALL ON FUNCTION public.create_marketplace_order_unchecked(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_marketplace_order_locked_unchecked(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_marketplace_order_unchecked(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.create_marketplace_order_locked_unchecked(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002094500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
