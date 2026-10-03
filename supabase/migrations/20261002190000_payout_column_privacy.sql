-- Keep Stripe transfer/reconciliation internals out of browser-accessible payout rows.
-- RLS continues to scope rows by vendor/admin, while column privileges now
-- expose only the vendor-safe payout projection to authenticated Data API clients.
-- Marketplace admins obtain the full ledger through a server-authorized
-- service-role projection.

REVOKE SELECT ON TABLE public.payouts FROM authenticated;

GRANT SELECT (
  id,
  vendor_id,
  period_start,
  period_end,
  gross_amount,
  commission_amount,
  refund_amount,
  dispute_hold_amount,
  net_amount,
  currency,
  status,
  paid_at,
  created_at
) ON TABLE public.payouts TO authenticated;

GRANT ALL ON TABLE public.payouts TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002190000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
