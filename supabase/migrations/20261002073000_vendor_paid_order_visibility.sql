-- Vendors must not receive customer/order data for unpaid or abandoned checkouts.
-- Visibility begins only after confirmed payment (including later partial refunds).

DROP POLICY IF EXISTS "Vendors view related orders" ON public.orders;
CREATE POLICY "Vendors view related orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  payment_status::text IN ('paid', 'partially_refunded')
  AND EXISTS (
    SELECT 1
    FROM public.order_items AS oi
    JOIN public.vendors AS v ON v.id = oi.vendor_id
    WHERE oi.order_id = orders.id
      AND v.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Vendors view own vendor orders" ON public.vendor_orders;
CREATE POLICY "Vendors view own vendor orders"
ON public.vendor_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.vendors AS v
    JOIN public.orders AS o ON o.id = vendor_orders.order_id
    WHERE v.id = vendor_orders.vendor_id
      AND v.user_id = auth.uid()
      AND o.payment_status::text IN ('paid', 'partially_refunded')
  )
);

DROP POLICY IF EXISTS "Vendors view own order items" ON public.order_items;
CREATE POLICY "Vendors view own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.vendors AS v
    JOIN public.orders AS o ON o.id = order_items.order_id
    WHERE v.id = order_items.vendor_id
      AND v.user_id = auth.uid()
      AND o.payment_status::text IN ('paid', 'partially_refunded')
  )
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
