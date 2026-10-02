-- Vendors must not receive customer/order data for unpaid or abandoned checkouts.
-- Visibility begins only after confirmed payment (including later partial refunds).
--
-- IMPORTANT: do not express the orders policy by selecting order_items while
-- the order_items policy selects orders. That creates a recursive RLS graph.
-- These SECURITY DEFINER helpers evaluate the relationship behind a narrow,
-- caller-bound API and keep the policies non-recursive.

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
  SELECT '20261002073000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
