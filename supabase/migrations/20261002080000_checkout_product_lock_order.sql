-- Deterministic product lock ordering for concurrent multi-product checkouts.
-- The wrapper acquires transaction-scoped advisory locks by sorted product id
-- before entering the existing server-authoritative checkout transaction.

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
DECLARE
  v_product_id uuid;
BEGIN
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

  RETURN public.create_marketplace_order(
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

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261002080000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
