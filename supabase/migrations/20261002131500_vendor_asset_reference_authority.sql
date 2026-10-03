-- Prevent vendor storefront branding from referencing another user's asset
-- or an arbitrary external URL. Vendor-controlled logo/banner references must
-- point to canonical objects under that vendor owner's auth.uid() prefix.

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
  v_require_approval boolean;
  v_default_commission numeric;
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

  IF NEW.logo_url IS NOT NULL AND (
    (storage.foldername(NEW.logo_url))[1] IS DISTINCT FROM NEW.user_id::text
    OR storage.filename(NEW.logo_url) !~
      '^logo-[0-9]{10,}-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.(png|jpg|webp|gif)$'
  ) THEN
    RAISE EXCEPTION 'Vendor logo asset ownership mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.banner_url IS NOT NULL AND (
    (storage.foldername(NEW.banner_url))[1] IS DISTINCT FROM NEW.user_id::text
    OR storage.filename(NEW.banner_url) !~
      '^banner-[0-9]{10,}-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.(png|jpg|webp|gif)$'
  ) THEN
    RAISE EXCEPTION 'Vendor banner asset ownership mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT
      s.require_vendor_approval,
      s.default_commission_rate
    INTO
      v_require_approval,
      v_default_commission
    FROM public.marketplace_settings AS s
    WHERE s.id = true;

    IF v_require_approval IS NULL OR v_default_commission IS NULL THEN
      RAISE EXCEPTION 'Marketplace vendor settings are unavailable'
        USING ERRCODE = 'P0001';
    END IF;

    NEW.country := 'CA';
    NEW.status := CASE
      WHEN v_require_approval
        THEN 'pending'::public.vendor_status
      ELSE 'active'::public.vendor_status
    END;
    NEW.subscription_status := 'none';
    NEW.subscription_plan := NULL;
    NEW.commission_rate := v_default_commission;
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

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002131500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
