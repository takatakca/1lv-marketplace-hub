-- Restrict vendor access to curated order projections.
-- RLS is row-oriented, not column-oriented. Vendors must not receive the full
-- parent public.orders row because it contains marketplace-wide totals,
-- billing/payment references, TAKATAK linkage and other internal fields.

DROP POLICY IF EXISTS "Vendors view related orders" ON public.orders;

CREATE OR REPLACE FUNCTION public.list_vendor_orders_for_current_user(
  _vendor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Unauthorized vendor order session'
      USING ERRCODE = '42501';
  END IF;

  IF _vendor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = _vendor_id
      AND v.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Forbidden vendor'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', vo.id,
        'order_id', vo.order_id,
        'vendor_id', vo.vendor_id,
        'subtotal', vo.subtotal,
        'commission_amount', vo.commission_amount,
        'vendor_payout_amount', vo.vendor_payout_amount,
        'status', vo.status::text,
        'tracking_number', vo.tracking_number,
        'carrier', vo.carrier,
        'created_at', vo.created_at,
        'updated_at', vo.updated_at,
        'orders', jsonb_build_object(
          'id', o.id,
          'order_number', o.order_number,
          'payment_status', o.payment_status::text,
          'customer_email', o.customer_email,
          'created_at', o.created_at
        )
      )
      ORDER BY vo.created_at DESC, vo.id
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.vendor_orders AS vo
  JOIN public.orders AS o ON o.id = vo.order_id
  WHERE vo.vendor_id = _vendor_id
    AND o.payment_status::text IN ('paid', 'partially_refunded')
    AND o.inventory_committed_at IS NOT NULL
    AND o.inventory_released_at IS NULL;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_order_for_current_user(
  _vendor_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Unauthorized vendor order session'
      USING ERRCODE = '42501';
  END IF;

  IF _vendor_order_id IS NULL THEN
    RAISE EXCEPTION 'Vendor order is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'id', vo.id,
    'order_id', vo.order_id,
    'vendor_id', vo.vendor_id,
    'subtotal', vo.subtotal,
    'commission_amount', vo.commission_amount,
    'vendor_payout_amount', vo.vendor_payout_amount,
    'status', vo.status::text,
    'tracking_number', vo.tracking_number,
    'carrier', vo.carrier,
    'created_at', vo.created_at,
    'updated_at', vo.updated_at,
    'orders', jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'payment_status', o.payment_status::text,
      'shipping_address', o.shipping_address,
      'customer_email', o.customer_email,
      'customer_phone', o.customer_phone,
      'created_at', o.created_at
    )
  )
  INTO v_result
  FROM public.vendor_orders AS vo
  JOIN public.vendors AS v ON v.id = vo.vendor_id
  JOIN public.orders AS o ON o.id = vo.order_id
  WHERE vo.id = _vendor_order_id
    AND v.user_id = v_user_id
    AND o.payment_status::text IN ('paid', 'partially_refunded')
    AND o.inventory_committed_at IS NOT NULL
    AND o.inventory_released_at IS NULL;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_vendor_orders_for_current_user(uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_vendor_order_for_current_user(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_vendor_orders_for_current_user(uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_order_for_current_user(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261002083000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
