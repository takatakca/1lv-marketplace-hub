-- Expired/unpaid inventory release is a terminal checkout state.
-- Once inventory and promotion reservations are released, the old order must
-- not remain visually or operationally pending.

CREATE OR REPLACE FUNCTION public.release_order_inventory(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
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
     OR v_order.inventory_released_at IS NOT NULL THEN
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
    AND payment_status IN (
      'unpaid'::public.payment_status,
      'failed'::public.payment_status
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.release_order_inventory(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261002091500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
