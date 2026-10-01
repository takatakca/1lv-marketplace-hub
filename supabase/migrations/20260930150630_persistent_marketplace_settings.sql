-- Persistent operational settings for 1LV.CA.
-- Admin writes only. Checkout reads trusted settings through service_role.

CREATE TABLE IF NOT EXISTS public.marketplace_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  marketplace_name text NOT NULL DEFAULT '1LV.CA',
  support_email text NOT NULL DEFAULT 'support@1lv.ca',
  default_commission_rate numeric(5,4) NOT NULL DEFAULT 0.10 CHECK (default_commission_rate >= 0 AND default_commission_rate <= 1),
  free_shipping_threshold numeric(12,2) NOT NULL DEFAULT 49 CHECK (free_shipping_threshold >= 0),
  standard_shipping_fee numeric(12,2) NOT NULL DEFAULT 7.99 CHECK (standard_shipping_fee >= 0),
  require_product_approval boolean NOT NULL DEFAULT true,
  require_vendor_approval boolean NOT NULL DEFAULT true,
  allow_guest_checkout boolean NOT NULL DEFAULT true,
  demo_mode boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.marketplace_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketplace_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.marketplace_settings TO authenticated;
GRANT ALL ON public.marketplace_settings TO service_role;

DROP POLICY IF EXISTS "Admins read marketplace settings" ON public.marketplace_settings;
CREATE POLICY "Admins read marketplace settings"
ON public.marketplace_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins update marketplace settings" ON public.marketplace_settings;
CREATE POLICY "Admins update marketplace settings"
ON public.marketplace_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.marketplace_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_version bigint NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_values jsonb NOT NULL,
  next_values jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_settings_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_settings_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketplace_settings_audit TO authenticated;
GRANT ALL ON public.marketplace_settings_audit TO service_role;

DROP POLICY IF EXISTS "Admins read marketplace settings audit" ON public.marketplace_settings_audit;
CREATE POLICY "Admins read marketplace settings audit"
ON public.marketplace_settings_audit FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.audit_marketplace_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();

  INSERT INTO public.marketplace_settings_audit (
    settings_version, changed_by, previous_values, next_values
  ) VALUES (
    NEW.version,
    auth.uid(),
    to_jsonb(OLD) - 'updated_by',
    to_jsonb(NEW) - 'updated_by'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_settings_audit_trigger ON public.marketplace_settings;
CREATE TRIGGER marketplace_settings_audit_trigger
BEFORE UPDATE ON public.marketplace_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_marketplace_settings();

CREATE OR REPLACE FUNCTION public.get_public_marketplace_settings()
RETURNS TABLE (
  marketplace_name text,
  support_email text,
  free_shipping_threshold numeric,
  standard_shipping_fee numeric,
  allow_guest_checkout boolean,
  demo_mode boolean,
  require_vendor_approval boolean,
  require_product_approval boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    s.marketplace_name,
    s.support_email,
    s.free_shipping_threshold,
    s.standard_shipping_fee,
    s.allow_guest_checkout,
    s.demo_mode,
    s.require_vendor_approval,
    s.require_product_approval
  FROM public.marketplace_settings AS s
  WHERE s.id = true;
$$;

REVOKE ALL ON FUNCTION public.get_public_marketplace_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_marketplace_settings() TO anon, authenticated, service_role;


-- Enforce marketplace-controlled vendor and product lifecycle fields at the
-- database boundary. Browser clients can still maintain their own profile and
-- product content, but approval, subscription, commission, Stripe and TAKATAK
-- operational state cannot be self-assigned.

DROP POLICY IF EXISTS "Users can create their own vendor record" ON public.vendors;
CREATE POLICY "Users can create their own vendor record"
ON public.vendors FOR INSERT TO authenticated
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND (select auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Vendors can update their own record" ON public.vendors;
CREATE POLICY "Vendors can update their own record"
ON public.vendors FOR UPDATE TO authenticated
USING (
  (select auth.uid()) IS NOT NULL
  AND (select auth.uid()) = user_id
)
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND (select auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Vendors insert own products" ON public.products;
CREATE POLICY "Vendors insert own products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = products.vendor_id
      AND v.user_id = (select auth.uid())
  )
);

DROP POLICY IF EXISTS "Vendors update own products" ON public.products;
CREATE POLICY "Vendors update own products"
ON public.products FOR UPDATE TO authenticated
USING (
  (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = products.vendor_id
      AND v.user_id = (select auth.uid())
  )
)
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = products.vendor_id
      AND v.user_id = (select auth.uid())
  )
);

DROP POLICY IF EXISTS "Vendors delete own products" ON public.products;
CREATE POLICY "Vendors delete own products"
ON public.products FOR DELETE TO authenticated
USING (
  (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = products.vendor_id
      AND v.user_id = (select auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.enforce_vendor_marketplace_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_require_approval boolean;
  v_default_commission numeric;
BEGIN
  IF session_user IN ('postgres', 'supabase_admin')
     OR v_jwt_role = 'service_role'
     OR (
       v_uid IS NOT NULL
       AND public.has_role(v_uid, 'admin'::public.app_role)
     ) THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL OR NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Vendor ownership mismatch'
      USING ERRCODE = '42501';
  END IF;

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

  IF TG_OP = 'INSERT' THEN
    NEW.status := CASE
      WHEN v_require_approval THEN 'pending'::public.vendor_status
      ELSE 'active'::public.vendor_status
    END;
    NEW.commission_rate := v_default_commission;
    NEW.subscription_status := 'none';
    NEW.subscription_plan := NULL;
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

  NEW.user_id := OLD.user_id;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.subscription_status := OLD.subscription_status;
  NEW.subscription_plan := OLD.subscription_plan;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  NEW.stripe_connect_account_id := OLD.stripe_connect_account_id;
  NEW.payouts_enabled := OLD.payouts_enabled;
  NEW.charges_enabled := OLD.charges_enabled;
  NEW.stripe_details_submitted := OLD.stripe_details_submitted;
  NEW.stripe_connect_status := OLD.stripe_connect_status;
  NEW.stripe_connect_last_checked_at := OLD.stripe_connect_last_checked_at;
  NEW.takatak_company_id := OLD.takatak_company_id;
  NEW.takatak_merchant_id := OLD.takatak_merchant_id;
  NEW.takatak_sync_status := OLD.takatak_sync_status;
  NEW.takatak_last_synced_at := OLD.takatak_last_synced_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vendor_marketplace_fields()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_vendor_marketplace_fields_trigger ON public.vendors;
CREATE TRIGGER enforce_vendor_marketplace_fields_trigger
BEFORE INSERT OR UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.enforce_vendor_marketplace_fields();

CREATE OR REPLACE FUNCTION public.enforce_product_marketplace_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_require_approval boolean;
  v_vendor_status text;
  v_subscription_status text;
BEGIN
  IF session_user IN ('postgres', 'supabase_admin')
     OR v_jwt_role = 'service_role'
     OR (
       v_uid IS NOT NULL
       AND public.has_role(v_uid, 'admin'::public.app_role)
     ) THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.vendor_id := OLD.vendor_id;
  END IF;

  SELECT
    v.status::text,
    v.subscription_status
  INTO
    v_vendor_status,
    v_subscription_status
  FROM public.vendors AS v
  WHERE v.id = NEW.vendor_id
    AND v.user_id = v_uid;

  IF v_vendor_status IS NULL THEN
    RAISE EXCEPTION 'Vendor ownership mismatch'
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

  IF TG_OP = 'INSERT' AND NEW.status IN (
    'rejected'::public.product_status,
    'archived'::public.product_status
  ) THEN
    NEW.status := 'draft'::public.product_status;
  END IF;

  IF NEW.status IN (
    'active'::public.product_status,
    'pending_review'::public.product_status
  ) THEN
    IF v_vendor_status <> 'active'
       OR v_subscription_status NOT IN ('active', 'trialing') THEN
      RAISE EXCEPTION 'Vendor must be approved with an active subscription before publishing'
        USING ERRCODE = '42501';
    END IF;

    IF v_require_approval THEN
      IF TG_OP = 'UPDATE'
         AND OLD.status = 'active'::public.product_status
         AND NEW.status = 'active'::public.product_status THEN
        NEW.status := 'active'::public.product_status;
      ELSE
        NEW.status := 'pending_review'::public.product_status;
      END IF;
    ELSE
      NEW.status := 'active'::public.product_status;
    END IF;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status = 'rejected'::public.product_status
        AND OLD.status <> 'rejected'::public.product_status THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_product_marketplace_fields()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_product_marketplace_fields_trigger ON public.products;
CREATE TRIGGER enforce_product_marketplace_fields_trigger
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_product_marketplace_fields();


CREATE OR REPLACE FUNCTION public.get_admin_marketplace_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_recent_orders jsonb;
BEGIN
  IF v_uid IS NULL
     OR NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'order', recent.order_number,
        'customer', COALESCE(recent.customer_email, '—'),
        'vendor', COALESCE(recent.vendor_names, 'Marketplace'),
        'total', recent.total,
        'status', recent.payment_status,
        'createdAt', recent.created_at
      )
      ORDER BY recent.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_orders
  FROM (
    SELECT
      o.id,
      o.order_number,
      o.customer_email,
      o.total,
      o.payment_status,
      o.created_at,
      string_agg(DISTINCT v.store_name, ', ' ORDER BY v.store_name) AS vendor_names
    FROM public.orders AS o
    LEFT JOIN public.vendor_orders AS vo ON vo.order_id = o.id
    LEFT JOIN public.vendors AS v ON v.id = vo.vendor_id
    GROUP BY
      o.id,
      o.order_number,
      o.customer_email,
      o.total,
      o.payment_status,
      o.created_at
    ORDER BY o.created_at DESC
    LIMIT 6
  ) AS recent;

  RETURN jsonb_build_object(
    'gmv',
      COALESCE((
        SELECT sum(o.total)
        FROM public.orders AS o
        WHERE o.payment_status = 'paid'
      ), 0),
    'orderCount',
      (SELECT count(*) FROM public.orders),
    'pendingVendors',
      (SELECT count(*) FROM public.vendors AS v WHERE v.status = 'pending'::public.vendor_status),
    'activeVendors',
      (SELECT count(*) FROM public.vendors AS v WHERE v.status = 'active'::public.vendor_status),
    'pendingProducts',
      (SELECT count(*) FROM public.products AS p WHERE p.status = 'pending_review'::public.product_status),
    'activeProducts',
      (SELECT count(*) FROM public.products AS p WHERE p.status = 'active'::public.product_status),
    'unpaidVendors',
      (
        SELECT count(*)
        FROM public.vendors AS v
        WHERE v.subscription_status IN ('past_due', 'unpaid')
      ),
    'commissionRevenue',
      COALESCE((SELECT sum(vo.commission_amount) FROM public.vendor_orders AS vo), 0),
    'payoutLiability',
      COALESCE((
        SELECT sum(vo.vendor_payout_amount)
        FROM public.vendor_orders AS vo
        WHERE vo.status NOT IN ('delivered', 'cancelled')
      ), 0),
    'openDisputes',
      (
        SELECT count(*)
        FROM public.disputes AS d
        WHERE d.status IN ('open', 'under_review', 'waiting_customer', 'waiting_vendor')
      ),
    'hasData',
      EXISTS (SELECT 1 FROM public.orders)
      OR EXISTS (SELECT 1 FROM public.vendors)
      OR EXISTS (SELECT 1 FROM public.products),
    'recentOrders',
      v_recent_orders
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_marketplace_overview()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_marketplace_overview()
TO authenticated, service_role;


-- Vendors may manage fulfillment state and shipping metadata, but marketplace
-- financial/ownership fields are immutable from authenticated browser sessions.
DROP POLICY IF EXISTS "Vendors update own vendor orders" ON public.vendor_orders;
CREATE POLICY "Vendors update own vendor orders"
ON public.vendor_orders FOR UPDATE TO authenticated
USING (
  (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = vendor_orders.vendor_id
      AND v.user_id = (select auth.uid())
  )
)
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = vendor_orders.vendor_id
      AND v.user_id = (select auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.enforce_vendor_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_owned boolean;
BEGIN
  IF session_user IN ('postgres', 'supabase_admin')
     OR v_jwt_role = 'service_role'
     OR (
       v_uid IS NOT NULL
       AND public.has_role(v_uid, 'admin'::public.app_role)
     ) THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = OLD.vendor_id
      AND v.user_id = v_uid
  )
  INTO v_owned;

  IF NOT v_owned THEN
    RAISE EXCEPTION 'Vendor order access denied'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.vendor_payout_amount IS DISTINCT FROM OLD.vendor_payout_amount
     OR NEW.refund_amount IS DISTINCT FROM OLD.refund_amount
     OR NEW.dispute_hold_amount IS DISTINCT FROM OLD.dispute_hold_amount
     OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Vendor order financial and ownership fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE OLD.status
      WHEN 'pending'::public.vendor_order_status THEN
        IF NEW.status NOT IN (
          'accepted'::public.vendor_order_status,
          'cancelled'::public.vendor_order_status
        ) THEN
          RAISE EXCEPTION 'Invalid vendor order transition: pending -> %', NEW.status
            USING ERRCODE = '22023';
        END IF;
      WHEN 'accepted'::public.vendor_order_status THEN
        IF NEW.status NOT IN (
          'processing'::public.vendor_order_status,
          'cancelled'::public.vendor_order_status
        ) THEN
          RAISE EXCEPTION 'Invalid vendor order transition: accepted -> %', NEW.status
            USING ERRCODE = '22023';
        END IF;
      WHEN 'processing'::public.vendor_order_status THEN
        IF NEW.status NOT IN (
          'shipped'::public.vendor_order_status,
          'cancelled'::public.vendor_order_status
        ) THEN
          RAISE EXCEPTION 'Invalid vendor order transition: processing -> %', NEW.status
            USING ERRCODE = '22023';
        END IF;
      WHEN 'shipped'::public.vendor_order_status THEN
        IF NEW.status <> 'delivered'::public.vendor_order_status THEN
          RAISE EXCEPTION 'Invalid vendor order transition: shipped -> %', NEW.status
            USING ERRCODE = '22023';
        END IF;
      WHEN 'delivered'::public.vendor_order_status THEN
        RAISE EXCEPTION 'Delivered vendor orders are final'
          USING ERRCODE = '22023';
      WHEN 'cancelled'::public.vendor_order_status THEN
        RAISE EXCEPTION 'Cancelled vendor orders are final'
          USING ERRCODE = '22023';
    END CASE;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vendor_order_update()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vendor_orders_enforce_vendor_update ON public.vendor_orders;
CREATE TRIGGER vendor_orders_enforce_vendor_update
BEFORE UPDATE ON public.vendor_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_vendor_order_update();


DROP POLICY IF EXISTS "Vendors update own order items" ON public.order_items;
CREATE POLICY "Vendors update own order items"
ON public.order_items FOR UPDATE TO authenticated
USING (
  (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = order_items.vendor_id
      AND v.user_id = (select auth.uid())
  )
)
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = order_items.vendor_id
      AND v.user_id = (select auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.enforce_order_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_owned boolean;
BEGIN
  IF session_user IN ('postgres', 'supabase_admin')
     OR v_jwt_role = 'service_role'
     OR (
       v_uid IS NOT NULL
       AND public.has_role(v_uid, 'admin'::public.app_role)
     ) THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = OLD.vendor_id
      AND v.user_id = v_uid
  )
  INTO v_owned;

  IF NOT v_owned THEN
    RAISE EXCEPTION 'Order item access denied'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
     OR NEW.inventory_reserved IS DISTINCT FROM OLD.inventory_reserved
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Order item commercial fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE OLD.status
      WHEN 'pending'::public.fulfillment_status THEN
        IF NEW.status NOT IN (
          'processing'::public.fulfillment_status,
          'cancelled'::public.fulfillment_status
        ) THEN
          RAISE EXCEPTION 'Invalid order item transition: pending -> %', NEW.status
            USING ERRCODE = '22023';
        END IF;
      WHEN 'processing'::public.fulfillment_status THEN
        IF NEW.status NOT IN (
          'shipped'::public.fulfillment_status,
          'cancelled'::public.fulfillment_status
        ) THEN
          RAISE EXCEPTION 'Invalid order item transition: processing -> %', NEW.status
            USING ERRCODE = '22023';
        END IF;
      WHEN 'shipped'::public.fulfillment_status THEN
        IF NEW.status <> 'delivered'::public.fulfillment_status THEN
          RAISE EXCEPTION 'Invalid order item transition: shipped -> %', NEW.status
            USING ERRCODE = '22023';
        END IF;
      WHEN 'delivered'::public.fulfillment_status THEN
        RAISE EXCEPTION 'Delivered order items are final'
          USING ERRCODE = '22023';
      WHEN 'cancelled'::public.fulfillment_status THEN
        RAISE EXCEPTION 'Cancelled order items are final'
          USING ERRCODE = '22023';
    END CASE;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_order_item_update()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_items_enforce_vendor_update ON public.order_items;
CREATE TRIGGER order_items_enforce_vendor_update
BEFORE UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_update();


-- Stripe webhook claims are atomic and retryable. Existing event-log rows are
-- treated as already processed; new webhook deliveries transition through
-- processing -> processed/failed.
ALTER TABLE public.stripe_event_log
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.stripe_event_log
    ADD CONSTRAINT stripe_event_log_status_check
    CHECK (status IN ('processing', 'processed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS stripe_event_log_status_updated_idx
  ON public.stripe_event_log (status, updated_at);

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  _id text,
  _type text,
  _payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  IF _id IS NULL OR length(_id) < 3 OR length(_id) > 255 THEN
    RAISE EXCEPTION 'Invalid Stripe event id'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stripe_event_log (
    id,
    type,
    payload,
    status,
    attempt_count,
    processed_at,
    updated_at
  )
  VALUES (
    _id,
    _type,
    _payload,
    'processing',
    1,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET type = EXCLUDED.type,
      payload = EXCLUDED.payload,
      status = 'processing',
      attempt_count = public.stripe_event_log.attempt_count + 1,
      last_error = NULL,
      updated_at = now()
  WHERE public.stripe_event_log.status = 'failed'
     OR (
       public.stripe_event_log.status = 'processing'
       AND public.stripe_event_log.updated_at < now() - interval '10 minutes'
     )
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text, jsonb)
TO service_role;
