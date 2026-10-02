-- Paid orders with an inventory conflict are intentionally held for admin review.
-- Vendors must not see or fulfill them until inventory was successfully committed.

CREATE OR REPLACE FUNCTION public.update_vendor_order_fulfillment(
  _vendor_order_id uuid,
  _next_status public.vendor_order_status,
  _tracking_number text DEFAULT NULL,
  _carrier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.vendor_orders%ROWTYPE;
  v_owner uuid;
  v_payment_status text;
  v_inventory_committed_at timestamptz;
  v_inventory_released_at timestamptz;
  v_current_status text;
  v_next_status text;
  v_tracking text;
  v_carrier text;
  v_all_delivered boolean := false;
  v_all_shipped_or_delivered boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Unauthorized vendor fulfillment session'
      USING ERRCODE = '42501';
  END IF;

  IF _vendor_order_id IS NULL OR _next_status IS NULL THEN
    RAISE EXCEPTION 'Vendor order and next status are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.vendor_orders
  WHERE id = _vendor_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor order not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    v.user_id,
    o.payment_status::text,
    o.inventory_committed_at,
    o.inventory_released_at
  INTO
    v_owner,
    v_payment_status,
    v_inventory_committed_at,
    v_inventory_released_at
  FROM public.vendors AS v
  JOIN public.orders AS o ON o.id = v_order.order_id
  WHERE v.id = v_order.vendor_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden vendor order'
      USING ERRCODE = '42501';
  END IF;

  IF v_payment_status NOT IN ('paid', 'partially_refunded') THEN
    RAISE EXCEPTION 'Vendor fulfillment requires a paid order'
      USING ERRCODE = '22023';
  END IF;

  IF v_inventory_committed_at IS NULL OR v_inventory_released_at IS NOT NULL THEN
    RAISE EXCEPTION 'Vendor fulfillment requires committed inventory'
      USING ERRCODE = '22023';
  END IF;

  v_current_status := v_order.status::text;
  v_next_status := _next_status::text;

  IF v_next_status = 'cancelled' THEN
    RAISE EXCEPTION 'Vendor cancellation requires the admin refund/cancellation workflow'
      USING ERRCODE = '22023';
  END IF;

  IF v_current_status <> v_next_status THEN
    IF NOT (
      (v_current_status = 'pending' AND v_next_status = 'accepted')
      OR
      (v_current_status = 'accepted' AND v_next_status = 'processing')
      OR
      (v_current_status = 'processing' AND v_next_status = 'shipped')
      OR
      (v_current_status = 'shipped' AND v_next_status = 'delivered')
    ) THEN
      RAISE EXCEPTION 'Invalid vendor fulfillment transition: % -> %',
        v_current_status,
        v_next_status
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_tracking := NULLIF(
    btrim(COALESCE(_tracking_number, v_order.tracking_number, '')),
    ''
  );
  v_carrier := NULLIF(
    btrim(COALESCE(_carrier, v_order.carrier, '')),
    ''
  );

  IF v_tracking IS NOT NULL AND length(v_tracking) > 120 THEN
    RAISE EXCEPTION 'Tracking number is too long'
      USING ERRCODE = '22023';
  END IF;

  IF v_carrier IS NOT NULL AND length(v_carrier) > 120 THEN
    RAISE EXCEPTION 'Carrier is too long'
      USING ERRCODE = '22023';
  END IF;

  IF v_next_status IN ('shipped', 'delivered')
     AND (v_tracking IS NULL OR v_carrier IS NULL) THEN
    RAISE EXCEPTION 'Tracking number and carrier are required before shipping'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendor_orders
  SET
    status = _next_status,
    tracking_number = v_tracking,
    carrier = v_carrier,
    updated_at = now()
  WHERE id = v_order.id;

  UPDATE public.order_items
  SET
    status = CASE v_next_status
      WHEN 'accepted' THEN 'pending'::public.fulfillment_status
      WHEN 'processing' THEN 'processing'::public.fulfillment_status
      WHEN 'shipped' THEN 'shipped'::public.fulfillment_status
      WHEN 'delivered' THEN 'delivered'::public.fulfillment_status
      ELSE status
    END,
    tracking_number = CASE
      WHEN v_next_status IN ('shipped', 'delivered') THEN v_tracking
      ELSE tracking_number
    END,
    carrier = CASE
      WHEN v_next_status IN ('shipped', 'delivered') THEN v_carrier
      ELSE carrier
    END,
    updated_at = now()
  WHERE order_id = v_order.order_id
    AND vendor_id = v_order.vendor_id;

  SELECT
    bool_and(status = 'delivered'::public.vendor_order_status),
    bool_and(
      status IN (
        'shipped'::public.vendor_order_status,
        'delivered'::public.vendor_order_status
      )
    )
  INTO
    v_all_delivered,
    v_all_shipped_or_delivered
  FROM public.vendor_orders
  WHERE order_id = v_order.order_id;

  UPDATE public.orders
  SET
    status = CASE
      WHEN COALESCE(v_all_delivered, false)
        THEN 'delivered'::public.order_status
      WHEN COALESCE(v_all_shipped_or_delivered, false)
        THEN 'shipped'::public.order_status
      ELSE 'processing'::public.order_status
    END,
    updated_at = now()
  WHERE id = v_order.order_id
    AND payment_status::text IN ('paid', 'partially_refunded')
    AND inventory_committed_at IS NOT NULL
    AND inventory_released_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'vendor_order_id', v_order.id,
    'order_id', v_order.order_id,
    'status', v_next_status,
    'tracking_number', v_tracking,
    'carrier', v_carrier,
    'order_status',
      CASE
        WHEN COALESCE(v_all_delivered, false) THEN 'delivered'
        WHEN COALESCE(v_all_shipped_or_delivered, false) THEN 'shipped'
        ELSE 'processing'
      END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_vendor_order_fulfillment(
  uuid,
  public.vendor_order_status,
  text,
  text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_vendor_order_fulfillment(
  uuid,
  public.vendor_order_status,
  text,
  text
) TO authenticated, service_role;

-- Tighten the non-recursive visibility helpers introduced in 073000:
-- vendors see commerce data only after payment AND successful inventory commit.
CREATE OR REPLACE FUNCTION public.vendor_can_view_paid_order(
  _order_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.is_takatak_authorized_session()
    AND EXISTS (
      SELECT 1
      FROM public.orders AS o
      JOIN public.order_items AS oi ON oi.order_id = o.id
      JOIN public.vendors AS v ON v.id = oi.vendor_id
      WHERE o.id = _order_id
        AND o.payment_status::text IN ('paid', 'partially_refunded')
        AND o.inventory_committed_at IS NOT NULL
        AND o.inventory_released_at IS NULL
        AND v.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.vendor_can_view_paid_order_scope(
  _order_id uuid,
  _vendor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.is_takatak_authorized_session()
    AND EXISTS (
      SELECT 1
      FROM public.orders AS o
      JOIN public.vendors AS v ON v.id = _vendor_id
      WHERE o.id = _order_id
        AND o.payment_status::text IN ('paid', 'partially_refunded')
        AND o.inventory_committed_at IS NOT NULL
        AND o.inventory_released_at IS NULL
        AND v.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.vendor_can_view_paid_order(uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vendor_can_view_paid_order_scope(uuid, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.vendor_can_view_paid_order(uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_can_view_paid_order_scope(uuid, uuid)
TO authenticated, service_role;

DROP POLICY IF EXISTS "Vendors view related orders" ON public.orders;
CREATE POLICY "Vendors view related orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.vendor_can_view_paid_order(id)
);

DROP POLICY IF EXISTS "Vendors view own vendor orders" ON public.vendor_orders;
CREATE POLICY "Vendors view own vendor orders"
ON public.vendor_orders
FOR SELECT
TO authenticated
USING (
  public.vendor_can_view_paid_order_scope(order_id, vendor_id)
);

DROP POLICY IF EXISTS "Vendors view own order items" ON public.order_items;
CREATE POLICY "Vendors view own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  public.vendor_can_view_paid_order_scope(order_id, vendor_id)
);

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261002074500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
