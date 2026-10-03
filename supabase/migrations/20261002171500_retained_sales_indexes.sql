-- Support retained public sold-count calculations without repeated full scans.
-- No business behavior changes: these indexes only accelerate the exact joins
-- already used by public.retained_product_sold_count(uuid).

CREATE INDEX IF NOT EXISTS order_items_product_order_vendor_idx
ON public.order_items (product_id, order_id, vendor_id)
WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS refund_records_vendor_status_idx
ON public.refund_records (vendor_order_id, status)
WHERE vendor_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002171500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
