-- Bind expired inventory release to the exact Stripe PaymentIntent state
-- that the trusted server just verified. This closes the race where a
-- PaymentIntent could be created/rebound after the maintenance worker read the
-- order but before PostgreSQL released reserved inventory.

CREATE OR REPLACE FUNCTION public.release_order_inventory(
  _order_id uuid,
  _expected_payment_intent_id text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_order.payment_status IN (
       'paid'::public.payment_status,
       'partially_refunded'::public.payment_status,
       'refunded'::public.payment_status
     )
     OR v_order.inventory_committed_at IS NOT NULL
     OR v_order.inventory_released_at IS NOT NULL
     OR v_order.inventory_reserved_until IS NULL
     OR v_order.inventory_reserved_until > now()
     OR v_order.stripe_payment_intent_id
        IS DISTINCT FROM _expected_payment_intent_id THEN
    RETURN false;
  END IF;

  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = _order_id
      AND inventory_reserved = true
      AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    UPDATE public.products
    SET
      inventory_quantity = inventory_quantity + v_item.quantity,
      updated_at = now()
    WHERE id = v_item.product_id;
  END LOOP;

  UPDATE public.order_items
  SET
    inventory_reserved = false,
    updated_at = now()
  WHERE order_id = _order_id
    AND inventory_reserved = true;

  UPDATE public.promotion_redemptions
  SET
    status = 'released',
    released_at = COALESCE(released_at, now())
  WHERE order_id = _order_id
    AND status = 'reserved';

  UPDATE public.orders
  SET
    inventory_reserved_until = NULL,
    inventory_released_at = now(),
    payment_status = 'failed'::public.payment_status,
    status = 'cancelled'::public.order_status,
    updated_at = now()
  WHERE id = _order_id
    AND inventory_committed_at IS NULL
    AND inventory_released_at IS NULL
    AND inventory_reserved_until IS NOT NULL
    AND inventory_reserved_until <= now()
    AND stripe_payment_intent_id IS NOT DISTINCT FROM _expected_payment_intent_id
    AND payment_status IN (
      'unpaid'::public.payment_status,
      'failed'::public.payment_status
    );

  RETURN FOUND;
END;
$$;

-- Retire the historical one-argument release path from the trusted API surface.
-- Keeping the function definition preserves migration history while preventing
-- any caller from bypassing the PaymentIntent compare-and-release contract.
REVOKE ALL ON FUNCTION public.release_order_inventory(uuid)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_order_inventory(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid, text)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261002144500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
