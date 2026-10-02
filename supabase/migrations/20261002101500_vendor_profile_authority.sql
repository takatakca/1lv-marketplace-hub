-- Vendor profile authority.
-- Browser vendors may edit only customer-facing profile fields. Marketplace
-- status/subscription/commission, Stripe/Connect capabilities, identity, and
-- TAKATAK master links remain server/admin authoritative.

CREATE OR REPLACE FUNCTION public.enforce_vendor_profile_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_service boolean := current_user IN (
    'service_role',
    'postgres',
    'supabase_admin'
  );
BEGIN
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NOT NULL THEN
    v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);
  END IF;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL OR NEW.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Vendor profile ownership mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Ignore any client attempt to seed server-owned marketplace state.
    NEW.country := 'CA';
    NEW.status := 'pending'::public.vendor_status;
    NEW.subscription_status := 'none';
    NEW.subscription_plan := NULL;
    NEW.commission_rate := 0.10;
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.stripe_connect_account_id := NULL;
    NEW.payouts_enabled := false;
    NEW.charges_enabled := false;
    NEW.stripe_details_submitted := false;
    NEW.stripe_connect_status := 'not_connected';
    NEW.stripe_connect_last_checked_at := NULL;
    NEW.takatak_company_id := NULL;
    NEW.takatak_merchant_id := NULL;
    NEW.takatak_sync_status := 'not_synced';
    NEW.takatak_last_synced_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.slug IS DISTINCT FROM OLD.slug
     OR NEW.country IS DISTINCT FROM OLD.country
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.stripe_connect_account_id IS DISTINCT FROM OLD.stripe_connect_account_id
     OR NEW.payouts_enabled IS DISTINCT FROM OLD.payouts_enabled
     OR NEW.charges_enabled IS DISTINCT FROM OLD.charges_enabled
     OR NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted
     OR NEW.stripe_connect_status IS DISTINCT FROM OLD.stripe_connect_status
     OR NEW.stripe_connect_last_checked_at IS DISTINCT FROM OLD.stripe_connect_last_checked_at
     OR NEW.takatak_company_id IS DISTINCT FROM OLD.takatak_company_id
     OR NEW.takatak_merchant_id IS DISTINCT FROM OLD.takatak_merchant_id
     OR NEW.takatak_sync_status IS DISTINCT FROM OLD.takatak_sync_status
     OR NEW.takatak_last_synced_at IS DISTINCT FROM OLD.takatak_last_synced_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Vendor attempted to modify server-authoritative fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vendor_profile_authority()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vendors_profile_authority ON public.vendors;
CREATE TRIGGER vendors_profile_authority
BEFORE INSERT OR UPDATE ON public.vendors
FOR EACH ROW
EXECUTE FUNCTION public.enforce_vendor_profile_authority();

DROP POLICY IF EXISTS "Users can create their own vendor record" ON public.vendors;
CREATE POLICY "Users can create their own vendor record"
ON public.vendors
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'::public.vendor_status
);

DROP POLICY IF EXISTS "Vendors can update their own record" ON public.vendors;
CREATE POLICY "Vendors can update their own record"
ON public.vendors
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002101500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
