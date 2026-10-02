-- Consolidate vendor/product authority into one BEFORE trigger per table.
-- Marketplace settings remain server-authoritative configuration instead of
-- being overwritten by competing historical triggers.

DROP TRIGGER IF EXISTS enforce_vendor_marketplace_fields_trigger
ON public.vendors;
DROP TRIGGER IF EXISTS enforce_product_marketplace_fields_trigger
ON public.products;

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

CREATE OR REPLACE FUNCTION public.enforce_vendor_product_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_service boolean := current_user IN ('service_role', 'postgres', 'supabase_admin');
  v_vendor_ready boolean := false;
  v_commercial_change boolean := false;
  v_require_approval boolean;
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

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated vendor session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    v.user_id = v_user_id
    AND v.status::text = 'active'
    AND v.subscription_status IN ('active', 'trialing')
  INTO v_vendor_ready
  FROM public.vendors AS v
  WHERE v.id = NEW.vendor_id
    AND v.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor cannot modify this product'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.require_product_approval
  INTO v_require_approval
  FROM public.marketplace_settings AS s
  WHERE s.id = true;

  IF v_require_approval IS NULL THEN
    RAISE EXCEPTION 'Marketplace product settings are unavailable'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN (
      'draft'::public.product_status,
      'pending_review'::public.product_status
    ) THEN
      RAISE EXCEPTION 'Vendor products must start as draft or pending review'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'pending_review'::public.product_status THEN
      IF NOT v_vendor_ready THEN
        RAISE EXCEPTION 'Vendor must be active with an active subscription before review'
          USING ERRCODE = '42501';
      END IF;

      IF NOT v_require_approval THEN
        NEW.status := 'active'::public.product_status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    RAISE EXCEPTION 'Vendor ownership cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN (
      'active'::public.product_status,
      'rejected'::public.product_status
    ) THEN
      RAISE EXCEPTION 'Only marketplace admins may approve or reject products'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'pending_review'::public.product_status THEN
      IF NOT v_vendor_ready THEN
        RAISE EXCEPTION 'Vendor must be active with an active subscription before review'
          USING ERRCODE = '42501';
      END IF;

      IF NOT v_require_approval THEN
        NEW.status := 'active'::public.product_status;
      END IF;
    END IF;
  END IF;

  v_commercial_change :=
    NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.short_description IS DISTINCT FROM OLD.short_description
    OR NEW.category_slug IS DISTINCT FROM OLD.category_slug
    OR NEW.price IS DISTINCT FROM OLD.price
    OR NEW.compare_at_price IS DISTINCT FROM OLD.compare_at_price
    OR NEW.images IS DISTINCT FROM OLD.images;

  IF OLD.status = 'active'::public.product_status
     AND NEW.status = 'active'::public.product_status
     AND v_commercial_change THEN
    IF NOT v_vendor_ready THEN
      RAISE EXCEPTION 'Vendor must be active with an active subscription before review'
        USING ERRCODE = '42501';
    END IF;

    IF v_require_approval THEN
      NEW.status := 'pending_review'::public.product_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vendor_product_authority()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002104500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
