-- Require automatic marketplace refunds to be scoped to one vendor split.
-- Order-level/unscoped legacy refunds must be reconciled manually instead of
-- entering automatic Stripe/payout accounting.

CREATE OR REPLACE FUNCTION public.enforce_refund_vendor_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN (
    'approved'::public.refund_status,
    'processing'::public.refund_status,
    'refunded'::public.refund_status
  )
  AND NEW.vendor_order_id IS NULL THEN
    RAISE EXCEPTION
      'Automatic marketplace refunds require a vendor order'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.vendor_order_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.vendor_orders AS vo
       WHERE vo.id = NEW.vendor_order_id
         AND vo.order_id = NEW.order_id
     ) THEN
    RAISE EXCEPTION
      'Refund vendor order does not belong to the refund order'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_refund_vendor_scope()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_refund_vendor_scope()
TO service_role, supabase_admin;

DROP TRIGGER IF EXISTS refund_records_enforce_vendor_scope
ON public.refund_records;

CREATE TRIGGER refund_records_enforce_vendor_scope
BEFORE INSERT OR UPDATE OF order_id, vendor_order_id, status
ON public.refund_records
FOR EACH ROW
EXECUTE FUNCTION public.enforce_refund_vendor_scope();

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
