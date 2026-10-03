-- Server-authoritative vendor performance analytics.
-- Operational and financial summaries are computed in PostgreSQL from 1LV
-- commerce truth instead of recomputing sensitive marketplace data in browsers.

CREATE OR REPLACE FUNCTION public.get_vendor_performance_dashboard(
  _vendor_id uuid,
  _days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  v_since timestamptz;
  v_result jsonb;
BEGIN
  PERFORM public.require_vendor_catalog_authority(_vendor_id);

  v_since := date_trunc('day', now()) - make_interval(days => v_days - 1);

  WITH paid_vendor_orders AS (
    SELECT
      vo.*,
      o.payment_status,
      o.created_at AS order_created_at
    FROM public.vendor_orders AS vo
    JOIN public.orders AS o ON o.id = vo.order_id
    WHERE vo.vendor_id = _vendor_id
      AND o.payment_status IN (
        'paid'::public.payment_status,
        'partially_refunded'::public.payment_status,
        'refunded'::public.payment_status
      )
  ),
  period_orders AS (
    SELECT *
    FROM paid_vendor_orders
    WHERE order_created_at >= v_since
  ),
  product_counts AS (
    SELECT jsonb_build_object(
      'total', count(*),
      'draft', count(*) FILTER (WHERE status = 'draft'::public.product_status),
      'pending', count(*) FILTER (WHERE status = 'pending_review'::public.product_status),
      'active', count(*) FILTER (WHERE status = 'active'::public.product_status),
      'rejected', count(*) FILTER (WHERE status = 'rejected'::public.product_status),
      'archived', count(*) FILTER (WHERE status = 'archived'::public.product_status)
    ) AS payload
    FROM public.products
    WHERE vendor_id = _vendor_id
  ),
  order_counts AS (
    SELECT jsonb_build_object(
      'total', count(*),
      'pending', count(*) FILTER (WHERE status = 'pending'::public.vendor_order_status),
      'accepted', count(*) FILTER (WHERE status = 'accepted'::public.vendor_order_status),
      'processing', count(*) FILTER (WHERE status = 'processing'::public.vendor_order_status),
      'shipped', count(*) FILTER (WHERE status = 'shipped'::public.vendor_order_status),
      'delivered', count(*) FILTER (WHERE status = 'delivered'::public.vendor_order_status),
      'cancelled', count(*) FILTER (WHERE status = 'cancelled'::public.vendor_order_status)
    ) AS payload
    FROM period_orders
  ),
  financials AS (
    SELECT jsonb_build_object(
      'gross_merchandise', COALESCE(sum(subtotal) FILTER (
        WHERE status <> 'cancelled'::public.vendor_order_status
      ), 0),
      'refunds', COALESCE(sum(refund_amount), 0),
      'commission', COALESCE(sum(commission_amount) FILTER (
        WHERE status <> 'cancelled'::public.vendor_order_status
      ), 0),
      'payout_estimate', COALESCE(sum(
        GREATEST(
          vendor_payout_amount - refund_amount - dispute_hold_amount,
          0
        )
      ) FILTER (
        WHERE status <> 'cancelled'::public.vendor_order_status
      ), 0)
    ) AS payload
    FROM period_orders
  ),
  paid_payouts AS (
    SELECT COALESCE(sum(net_amount), 0) AS amount
    FROM public.payouts
    WHERE vendor_id = _vendor_id
      AND status = 'paid'::public.payout_status
      AND paid_at >= v_since
  ),
  shipment_metrics AS (
    SELECT
      count(*) FILTER (
        WHERE s.status <> 'cancelled'::public.shipment_status
      )::bigint AS shipment_count,
      count(*) FILTER (
        WHERE s.shipped_at IS NOT NULL
          AND s.promised_ship_at IS NOT NULL
          AND s.shipped_at <= s.promised_ship_at
      )::bigint AS on_time_ship_count,
      count(*) FILTER (
        WHERE s.delivered_at IS NOT NULL
          AND s.estimated_delivery_at IS NOT NULL
          AND s.delivered_at <= s.estimated_delivery_at
      )::bigint AS on_time_delivery_count,
      count(*) FILTER (
        WHERE s.delivered_at IS NOT NULL
      )::bigint AS delivered_shipment_count,
      count(*) FILTER (
        WHERE s.status = 'exception'::public.shipment_status
      )::bigint AS exception_count,
      avg(
        EXTRACT(EPOCH FROM (s.shipped_at - s.created_at)) / 3600.0
      ) FILTER (
        WHERE s.shipped_at IS NOT NULL
          AND s.shipped_at >= s.created_at
      ) AS average_handling_hours
    FROM public.shipments AS s
    WHERE s.vendor_id = _vendor_id
      AND s.created_at >= v_since
  ),
  return_metrics AS (
    SELECT
      count(*) FILTER (
        WHERE rr.status NOT IN (
          'cancelled'::public.return_status,
          'rejected'::public.return_status
        )
      )::bigint AS active_or_completed_returns,
      count(*) FILTER (
        WHERE rr.status IN (
          'requested'::public.return_status,
          'approved'::public.return_status,
          'label_issued'::public.return_status,
          'in_transit'::public.return_status,
          'received'::public.return_status,
          'inspecting'::public.return_status,
          'refund_approved'::public.return_status
        )
      )::bigint AS open_returns,
      COALESCE(sum(ri.quantity) FILTER (
        WHERE rr.status NOT IN (
          'cancelled'::public.return_status,
          'rejected'::public.return_status
        )
      ), 0)::bigint AS returned_units
    FROM public.return_requests AS rr
    LEFT JOIN public.return_items AS ri ON ri.return_request_id = rr.id
    WHERE rr.vendor_id = _vendor_id
      AND rr.created_at >= v_since
  ),
  delivered_units AS (
    SELECT COALESCE(sum(oi.quantity), 0)::bigint AS quantity
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    WHERE oi.vendor_id = _vendor_id
      AND oi.status = 'delivered'::public.fulfillment_status
      AND o.payment_status IN (
        'paid'::public.payment_status,
        'partially_refunded'::public.payment_status,
        'refunded'::public.payment_status
      )
      AND o.created_at >= v_since
  )
  SELECT jsonb_build_object(
    'period_days', v_days,
    'period_start', v_since,
    'products', pc.payload,
    'orders', oc.payload,
    'financials', f.payload || jsonb_build_object(
      'payouts_paid', pp.amount
    ),
    'fulfillment', jsonb_build_object(
      'shipments', sm.shipment_count,
      'on_time_shipments', sm.on_time_ship_count,
      'on_time_ship_rate',
        CASE
          WHEN sm.shipment_count = 0 THEN 0
          ELSE round(
            (sm.on_time_ship_count::numeric / sm.shipment_count::numeric) * 100,
            2
          )
        END,
      'delivered_shipments', sm.delivered_shipment_count,
      'on_time_deliveries', sm.on_time_delivery_count,
      'on_time_delivery_rate',
        CASE
          WHEN sm.delivered_shipment_count = 0 THEN 0
          ELSE round(
            (
              sm.on_time_delivery_count::numeric
              / sm.delivered_shipment_count::numeric
            ) * 100,
            2
          )
        END,
      'exceptions', sm.exception_count,
      'average_handling_hours',
        COALESCE(round(sm.average_handling_hours::numeric, 2), 0)
    ),
    'returns', jsonb_build_object(
      'total', rm.active_or_completed_returns,
      'open', rm.open_returns,
      'returned_units', rm.returned_units,
      'delivered_units', du.quantity,
      'unit_return_rate',
        CASE
          WHEN du.quantity = 0 THEN 0
          ELSE round(
            (rm.returned_units::numeric / du.quantity::numeric) * 100,
            2
          )
        END
    )
  )
  INTO v_result
  FROM product_counts AS pc
  CROSS JOIN order_counts AS oc
  CROSS JOIN financials AS f
  CROSS JOIN paid_payouts AS pp
  CROSS JOIN shipment_metrics AS sm
  CROSS JOIN return_metrics AS rm
  CROSS JOIN delivered_units AS du;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_performance_dashboard(uuid, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_performance_dashboard(uuid, integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vendor_daily_sales(
  _vendor_id uuid,
  _days integer DEFAULT 30
)
RETURNS TABLE (
  sale_date date,
  orders bigint,
  gross_merchandise numeric,
  refunds numeric,
  commission numeric,
  payout_estimate numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  v_start date := current_date - (v_days - 1);
BEGIN
  PERFORM public.require_vendor_catalog_authority(_vendor_id);

  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(
      v_start::timestamp,
      current_date::timestamp,
      interval '1 day'
    )::date AS sale_date
  ),
  totals AS (
    SELECT
      o.created_at::date AS sale_date,
      count(*)::bigint AS orders,
      COALESCE(sum(vo.subtotal), 0) AS gross_merchandise,
      COALESCE(sum(vo.refund_amount), 0) AS refunds,
      COALESCE(sum(vo.commission_amount), 0) AS commission,
      COALESCE(sum(
        GREATEST(
          vo.vendor_payout_amount
          - vo.refund_amount
          - vo.dispute_hold_amount,
          0
        )
      ), 0) AS payout_estimate
    FROM public.vendor_orders AS vo
    JOIN public.orders AS o ON o.id = vo.order_id
    WHERE vo.vendor_id = _vendor_id
      AND o.created_at::date >= v_start
      AND o.payment_status IN (
        'paid'::public.payment_status,
        'partially_refunded'::public.payment_status,
        'refunded'::public.payment_status
      )
      AND vo.status <> 'cancelled'::public.vendor_order_status
    GROUP BY o.created_at::date
  )
  SELECT
    d.sale_date,
    COALESCE(t.orders, 0)::bigint,
    COALESCE(t.gross_merchandise, 0)::numeric,
    COALESCE(t.refunds, 0)::numeric,
    COALESCE(t.commission, 0)::numeric,
    COALESCE(t.payout_estimate, 0)::numeric
  FROM dates AS d
  LEFT JOIN totals AS t USING (sale_date)
  ORDER BY d.sale_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_daily_sales(uuid, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_daily_sales(uuid, integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vendor_top_products(
  _vendor_id uuid,
  _days integer DEFAULT 30,
  _limit integer DEFAULT 10
)
RETURNS TABLE (
  product_id uuid,
  title text,
  units_sold bigint,
  gross_merchandise numeric,
  order_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 10), 1), 100);
  v_since timestamptz;
BEGIN
  PERFORM public.require_vendor_catalog_authority(_vendor_id);

  v_since := date_trunc('day', now()) - make_interval(days => v_days - 1);

  RETURN QUERY
  SELECT
    p.id,
    p.title,
    sum(oi.quantity)::bigint AS units_sold,
    round(sum(oi.unit_price * oi.quantity)::numeric, 2) AS gross_merchandise,
    count(DISTINCT oi.order_id)::bigint AS order_count
  FROM public.order_items AS oi
  JOIN public.orders AS o ON o.id = oi.order_id
  JOIN public.products AS p ON p.id = oi.product_id
  WHERE oi.vendor_id = _vendor_id
    AND o.created_at >= v_since
    AND o.payment_status IN (
      'paid'::public.payment_status,
      'partially_refunded'::public.payment_status,
      'refunded'::public.payment_status
    )
  GROUP BY p.id, p.title
  ORDER BY
    units_sold DESC,
    gross_merchandise DESC,
    p.id
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_top_products(uuid, integer, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_top_products(uuid, integer, integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003060000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
