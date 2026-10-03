-- Persistent, server-validated promotions for 1LV.CA.
-- Generated via: supabase migration new persistent_promotions
--
-- Promotions are never trusted from the browser. The checkout transaction accepts
-- only an optional code; eligibility, targets, usage limits and discount amounts
-- are calculated inside PostgreSQL before the order total is stored.

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL,
  discount_value numeric(12,2) NOT NULL DEFAULT 0,
  max_discount numeric(12,2),
  min_order numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT false,
  publicly_listed boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  global_usage_limit integer,
  per_customer_limit integer,
  first_order_only boolean NOT NULL DEFAULT false,
  stackable boolean NOT NULL DEFAULT false,
  exclusive_group text,
  restores_on_refund boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_code_format CHECK (
    code = upper(code)
    AND code ~ '^[A-Z0-9_-]{3,32}$'
  ),
  CONSTRAINT promotions_discount_type CHECK (
    discount_type IN ('percent', 'fixed', 'free_shipping')
  ),
  CONSTRAINT promotions_discount_value CHECK (
    (discount_type = 'percent' AND discount_value > 0 AND discount_value <= 100)
    OR (discount_type = 'fixed' AND discount_value > 0)
    OR (discount_type = 'free_shipping' AND discount_value = 0)
  ),
  CONSTRAINT promotions_min_order_nonnegative CHECK (min_order >= 0),
  CONSTRAINT promotions_max_discount_positive CHECK (
    max_discount IS NULL OR max_discount > 0
  ),
  CONSTRAINT promotions_usage_limit_positive CHECK (
    global_usage_limit IS NULL OR global_usage_limit > 0
  ),
  CONSTRAINT promotions_customer_limit_positive CHECK (
    per_customer_limit IS NULL OR per_customer_limit > 0
  ),
  CONSTRAINT promotions_window_valid CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at
  )
);

CREATE INDEX promotions_active_window_idx
  ON public.promotions (active, publicly_listed, starts_at, ends_at);
CREATE INDEX promotions_code_upper_idx
  ON public.promotions (upper(code));

CREATE TABLE public.promotion_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  category_slug text,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  is_exclusion boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_targets_type CHECK (
    target_type IN ('vendor', 'category', 'product')
  ),
  CONSTRAINT promotion_targets_exact_target CHECK (
    (target_type = 'vendor' AND vendor_id IS NOT NULL AND category_slug IS NULL AND product_id IS NULL)
    OR
    (target_type = 'category' AND vendor_id IS NULL AND category_slug IS NOT NULL AND product_id IS NULL)
    OR
    (target_type = 'product' AND vendor_id IS NULL AND category_slug IS NULL AND product_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX promotion_targets_vendor_uidx
  ON public.promotion_targets (promotion_id, vendor_id, is_exclusion)
  WHERE target_type = 'vendor';
CREATE UNIQUE INDEX promotion_targets_category_uidx
  ON public.promotion_targets (promotion_id, category_slug, is_exclusion)
  WHERE target_type = 'category';
CREATE UNIQUE INDEX promotion_targets_product_uidx
  ON public.promotion_targets (promotion_id, product_id, is_exclusion)
  WHERE target_type = 'product';
CREATE INDEX promotion_targets_promotion_idx
  ON public.promotion_targets (promotion_id);

CREATE TABLE public.promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid,
  customer_email text NOT NULL,
  code_snapshot text NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  merchandise_discount numeric(12,2) NOT NULL DEFAULT 0,
  shipping_discount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'reserved',
  expires_at timestamptz,
  redeemed_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_redemptions_status CHECK (
    status IN ('reserved', 'redeemed', 'released', 'refunded')
  ),
  CONSTRAINT promotion_redemptions_discount_nonnegative CHECK (
    discount_amount >= 0
    AND merchandise_discount >= 0
    AND shipping_discount >= 0
  ),
  UNIQUE (order_id)
);

CREATE INDEX promotion_redemptions_usage_idx
  ON public.promotion_redemptions (promotion_id, status, expires_at);
CREATE INDEX promotion_redemptions_customer_idx
  ON public.promotion_redemptions (promotion_id, customer_id, customer_email);

CREATE TABLE public.promotion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX promotion_audit_promotion_idx
  ON public.promotion_audit (promotion_id, created_at DESC);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_code text,
  ADD COLUMN IF NOT EXISTS promotion_savings_total numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view listed active promotions"
ON public.promotions
FOR SELECT
TO anon, authenticated
USING (
  active = true
  AND publicly_listed = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at > now())
);

REVOKE ALL ON public.promotions FROM anon, authenticated;
GRANT SELECT (
  id,
  code,
  name,
  description,
  discount_type,
  discount_value,
  max_discount,
  min_order,
  starts_at,
  ends_at,
  first_order_only,
  stackable,
  priority,
  active,
  publicly_listed
) ON public.promotions TO anon, authenticated;

REVOKE ALL ON public.promotion_targets FROM anon, authenticated;
REVOKE ALL ON public.promotion_redemptions FROM anon, authenticated;
REVOKE ALL ON public.promotion_audit FROM anon, authenticated;

DROP VIEW IF EXISTS public.public_promotions;
CREATE VIEW public.public_promotions
WITH (security_invoker = true) AS
SELECT
  id,
  code,
  name,
  description,
  discount_type,
  discount_value,
  max_discount,
  min_order,
  starts_at,
  ends_at,
  first_order_only,
  stackable,
  priority
FROM public.promotions
WHERE active = true
  AND publicly_listed = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at > now());

GRANT SELECT ON public.public_promotions TO anon, authenticated;

DROP TRIGGER IF EXISTS promotions_set_updated_at ON public.promotions;
CREATE TRIGGER promotions_set_updated_at
BEFORE UPDATE ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.audit_promotion_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.promotion_audit (
      promotion_id,
      actor_user_id,
      action,
      before_state,
      after_state
    )
    VALUES (
      NEW.id,
      auth.uid(),
      'created',
      NULL,
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.promotion_audit (
      promotion_id,
      actor_user_id,
      action,
      before_state,
      after_state
    )
    VALUES (
      NEW.id,
      auth.uid(),
      'updated',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.promotion_audit (
      promotion_id,
      actor_user_id,
      action,
      before_state,
      after_state
    )
    VALUES (
      OLD.id,
      auth.uid(),
      'deleted',
      to_jsonb(OLD),
      NULL
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_promotion_change()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_promotion_change()
  TO service_role, supabase_admin;

DROP TRIGGER IF EXISTS promotions_audit_changes ON public.promotions;
CREATE TRIGGER promotions_audit_changes
AFTER INSERT OR UPDATE OR DELETE ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.audit_promotion_change();

CREATE OR REPLACE FUNCTION public.reserve_order_promotion(
  _order_id uuid,
  _promotion_code text,
  _customer_id uuid,
  _customer_email text,
  _base_shipping numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_promotion public.promotions%ROWTYPE;
  v_code text;
  v_order_subtotal numeric(12,2);
  v_eligible_subtotal numeric(12,2);
  v_merchandise_discount numeric(12,2) := 0;
  v_shipping_discount numeric(12,2) := 0;
  v_total_savings numeric(12,2) := 0;
  v_global_usage integer;
  v_customer_usage integer;
  v_first_order_count integer;
  v_reservation_expiry timestamptz;
BEGIN
  v_code := upper(btrim(COALESCE(_promotion_code, '')));
  IF v_code = '' THEN
    RETURN jsonb_build_object(
      'promotion_id', NULL,
      'promotion_code', NULL,
      'merchandise_discount', 0,
      'shipping_discount', 0,
      'promotion_savings_total', 0
    );
  END IF;

  IF v_code !~ '^[A-Z0-9_-]{3,32}$' THEN
    RAISE EXCEPTION 'Invalid promotion code'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_promotion
  FROM public.promotions
  WHERE code = v_code
  FOR UPDATE;

  IF NOT FOUND
     OR v_promotion.active = false
     OR (v_promotion.starts_at IS NOT NULL AND v_promotion.starts_at > now())
     OR (v_promotion.ends_at IS NOT NULL AND v_promotion.ends_at <= now()) THEN
    RAISE EXCEPTION 'Promotion is not active'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.promotion_redemptions
  SET status = 'released',
      released_at = now()
  WHERE promotion_id = v_promotion.id
    AND status = 'reserved'
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  SELECT subtotal, inventory_reserved_until
  INTO v_order_subtotal, v_reservation_expiry
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_order_subtotal < v_promotion.min_order THEN
    RAISE EXCEPTION 'Promotion minimum order has not been reached'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)
  INTO v_global_usage
  FROM public.promotion_redemptions
  WHERE promotion_id = v_promotion.id
    AND (
      status = 'redeemed'
      OR (
        status = 'reserved'
        AND (expires_at IS NULL OR expires_at > now())
      )
    );

  IF v_promotion.global_usage_limit IS NOT NULL
     AND v_global_usage >= v_promotion.global_usage_limit THEN
    RAISE EXCEPTION 'Promotion usage limit has been reached'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)
  INTO v_customer_usage
  FROM public.promotion_redemptions
  WHERE promotion_id = v_promotion.id
    AND (
      (_customer_id IS NOT NULL AND customer_id = _customer_id)
      OR (
        _customer_id IS NULL
        AND lower(customer_email) = lower(_customer_email)
      )
    )
    AND (
      status = 'redeemed'
      OR (
        status = 'reserved'
        AND (expires_at IS NULL OR expires_at > now())
      )
    );

  IF v_promotion.per_customer_limit IS NOT NULL
     AND v_customer_usage >= v_promotion.per_customer_limit THEN
    RAISE EXCEPTION 'Promotion customer usage limit has been reached'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_promotion.first_order_only THEN
    SELECT count(*)
    INTO v_first_order_count
    FROM public.orders
    WHERE id <> _order_id
      AND payment_status = 'paid'::public.payment_status
      AND (
        (_customer_id IS NOT NULL AND customer_id = _customer_id)
        OR (
          _customer_id IS NULL
          AND customer_id IS NULL
          AND lower(COALESCE(customer_email, '')) = lower(_customer_email)
        )
      );

    IF v_first_order_count > 0 THEN
      RAISE EXCEPTION 'Promotion is available on the first paid order only'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT COALESCE(sum(oi.unit_price * oi.quantity), 0)
  INTO v_eligible_subtotal
  FROM public.order_items AS oi
  JOIN public.products AS p ON p.id = oi.product_id
  WHERE oi.order_id = _order_id
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.promotion_targets AS include_target
        WHERE include_target.promotion_id = v_promotion.id
          AND include_target.is_exclusion = false
      )
      OR EXISTS (
        SELECT 1
        FROM public.promotion_targets AS include_target
        WHERE include_target.promotion_id = v_promotion.id
          AND include_target.is_exclusion = false
          AND (
            (include_target.target_type = 'vendor' AND include_target.vendor_id = oi.vendor_id)
            OR
            (include_target.target_type = 'category' AND include_target.category_slug = p.category_slug)
            OR
            (include_target.target_type = 'product' AND include_target.product_id = oi.product_id)
          )
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.promotion_targets AS exclude_target
      WHERE exclude_target.promotion_id = v_promotion.id
        AND exclude_target.is_exclusion = true
        AND (
          (exclude_target.target_type = 'vendor' AND exclude_target.vendor_id = oi.vendor_id)
          OR
          (exclude_target.target_type = 'category' AND exclude_target.category_slug = p.category_slug)
          OR
          (exclude_target.target_type = 'product' AND exclude_target.product_id = oi.product_id)
        )
    );

  IF v_eligible_subtotal <= 0 THEN
    RAISE EXCEPTION 'Promotion does not apply to the items in this order'
      USING ERRCODE = 'P0001';
  END IF;

  CASE v_promotion.discount_type
    WHEN 'percent' THEN
      v_merchandise_discount := round(
        (v_eligible_subtotal * v_promotion.discount_value / 100)::numeric,
        2
      );
      IF v_promotion.max_discount IS NOT NULL THEN
        v_merchandise_discount := least(
          v_merchandise_discount,
          v_promotion.max_discount
        );
      END IF;
    WHEN 'fixed' THEN
      v_merchandise_discount := least(
        v_promotion.discount_value,
        v_eligible_subtotal
      );
    WHEN 'free_shipping' THEN
      v_shipping_discount := greatest(0, COALESCE(_base_shipping, 0));
    ELSE
      RAISE EXCEPTION 'Unsupported promotion type'
        USING ERRCODE = 'P0001';
  END CASE;

  v_merchandise_discount := least(
    greatest(0, v_merchandise_discount),
    v_order_subtotal
  );
  v_shipping_discount := least(
    greatest(0, v_shipping_discount),
    greatest(0, COALESCE(_base_shipping, 0))
  );
  v_total_savings := round(
    (v_merchandise_discount + v_shipping_discount)::numeric,
    2
  );

  IF v_total_savings <= 0 THEN
    RAISE EXCEPTION 'Promotion does not create savings on this order'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.promotion_redemptions (
    promotion_id,
    order_id,
    customer_id,
    customer_email,
    code_snapshot,
    discount_amount,
    merchandise_discount,
    shipping_discount,
    status,
    expires_at
  )
  VALUES (
    v_promotion.id,
    _order_id,
    _customer_id,
    lower(_customer_email),
    v_promotion.code,
    v_total_savings,
    v_merchandise_discount,
    v_shipping_discount,
    'reserved',
    v_reservation_expiry
  );

  RETURN jsonb_build_object(
    'promotion_id', v_promotion.id,
    'promotion_code', v_promotion.code,
    'merchandise_discount', v_merchandise_discount,
    'shipping_discount', v_shipping_discount,
    'promotion_savings_total', v_total_savings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_order_promotion(
  uuid, text, uuid, text, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_order_promotion(
  uuid, text, uuid, text, numeric
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_order_inventory(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_order.payment_status = 'paid'::public.payment_status
     OR v_order.inventory_committed_at IS NOT NULL
     OR v_order.inventory_released_at IS NOT NULL THEN
    RETURN false;
  END IF;

  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = _order_id
      AND inventory_reserved = true
      AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    UPDATE public.products
    SET inventory_quantity = inventory_quantity + v_item.quantity,
        updated_at = now()
    WHERE id = v_item.product_id;
  END LOOP;

  UPDATE public.order_items
  SET inventory_reserved = false,
      updated_at = now()
  WHERE order_id = _order_id
    AND inventory_reserved = true;

  UPDATE public.promotion_redemptions
  SET status = 'released',
      released_at = now()
  WHERE order_id = _order_id
    AND status = 'reserved';

  UPDATE public.orders
  SET inventory_reserved_until = NULL,
      inventory_released_at = now(),
      updated_at = now()
  WHERE id = _order_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.release_order_inventory(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.commit_order_inventory(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_order.inventory_released_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF v_order.inventory_committed_at IS NOT NULL THEN
    RETURN true;
  END IF;

  UPDATE public.order_items
  SET inventory_reserved = false,
      updated_at = now()
  WHERE order_id = _order_id
    AND inventory_reserved = true;

  UPDATE public.promotion_redemptions
  SET status = 'redeemed',
      redeemed_at = now(),
      expires_at = NULL
  WHERE order_id = _order_id
    AND status = 'reserved';

  UPDATE public.orders
  SET inventory_reserved_until = NULL,
      inventory_committed_at = now(),
      updated_at = now()
  WHERE id = _order_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_order_inventory(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_order_inventory(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_order_promotion_refunded(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.promotion_redemptions AS redemption
  SET status = 'refunded',
      refunded_at = now()
  FROM public.promotions AS promotion
  WHERE redemption.order_id = _order_id
    AND redemption.promotion_id = promotion.id
    AND redemption.status = 'redeemed'
    AND promotion.restores_on_refund = true;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_promotion_refunded(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_promotion_refunded(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, uuid
);

CREATE FUNCTION public.create_marketplace_order(
  _customer_id uuid,
  _customer_email text,
  _customer_phone text,
  _shipping_address jsonb,
  _billing_address jsonb,
  _items jsonb,
  _idempotency_key uuid,
  _promotion_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_idempotency_hash text;
  v_existing public.orders%ROWTYPE;
  v_order_id uuid;
  v_order_number text;
  v_email text;
  v_phone text;
  v_shipping jsonb;
  v_billing jsonb;
  v_province text;
  v_tax_rate numeric(8,5);
  v_tax_label text;
  v_subtotal numeric(12,2) := 0;
  v_shipping_total numeric(12,2) := 0;
  v_base_shipping numeric(12,2) := 0;
  v_shipping_discount numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_promotion_savings_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_promotion jsonb;
  v_promotion_id uuid;
  v_applied_promotion_code text;
  v_requested_promotion_code text;
  v_allow_guest_checkout boolean;
  v_item record;
  v_product record;
  v_line_total numeric(12,2);
BEGIN
  PERFORM public.release_expired_inventory_reservations(50);

  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Invalid checkout idempotency key'
      USING ERRCODE = '22023';
  END IF;

  v_requested_promotion_code := NULLIF(
    upper(btrim(COALESCE(_promotion_code, ''))),
    ''
  );

  v_idempotency_hash := encode(
    extensions.digest(convert_to(_idempotency_key::text, 'UTF8'), 'sha256'),
    'hex'
  );

  PERFORM pg_advisory_xact_lock(hashtextextended(v_idempotency_hash, 0));

  v_email := lower(btrim(COALESCE(_customer_email, '')));
  IF length(v_email) < 5
     OR length(v_email) > 320
     OR position('@' IN v_email) <= 1 THEN
    RAISE EXCEPTION 'A valid customer email is required'
      USING ERRCODE = '22023';
  END IF;

  v_phone := NULLIF(btrim(COALESCE(_customer_phone, '')), '');
  IF v_phone IS NOT NULL AND length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Customer phone is too long'
      USING ERRCODE = '22023';
  END IF;

  IF _shipping_address IS NULL OR jsonb_typeof(_shipping_address) <> 'object' THEN
    RAISE EXCEPTION 'Shipping address is required'
      USING ERRCODE = '22023';
  END IF;

  IF btrim(COALESCE(_shipping_address->>'first_name', '')) = ''
     OR btrim(COALESCE(_shipping_address->>'last_name', '')) = ''
     OR btrim(COALESCE(_shipping_address->>'address', '')) = ''
     OR btrim(COALESCE(_shipping_address->>'city', '')) = ''
     OR btrim(COALESCE(_shipping_address->>'postal_code', '')) = '' THEN
    RAISE EXCEPTION 'Shipping address is incomplete'
      USING ERRCODE = '22023';
  END IF;

  v_province := upper(btrim(COALESCE(_shipping_address->>'province', '')));
  CASE v_province
    WHEN 'AB' THEN v_tax_rate := 0.05;    v_tax_label := 'GST';
    WHEN 'BC' THEN v_tax_rate := 0.12;    v_tax_label := 'GST + PST';
    WHEN 'MB' THEN v_tax_rate := 0.12;    v_tax_label := 'GST + RST';
    WHEN 'NB' THEN v_tax_rate := 0.15;    v_tax_label := 'HST';
    WHEN 'NL' THEN v_tax_rate := 0.15;    v_tax_label := 'HST';
    WHEN 'NT' THEN v_tax_rate := 0.05;    v_tax_label := 'GST';
    WHEN 'NS' THEN v_tax_rate := 0.14;    v_tax_label := 'HST';
    WHEN 'NU' THEN v_tax_rate := 0.05;    v_tax_label := 'GST';
    WHEN 'ON' THEN v_tax_rate := 0.13;    v_tax_label := 'HST';
    WHEN 'PE' THEN v_tax_rate := 0.15;    v_tax_label := 'HST';
    WHEN 'QC' THEN v_tax_rate := 0.14975; v_tax_label := 'GST + QST';
    WHEN 'SK' THEN v_tax_rate := 0.11;    v_tax_label := 'GST + PST';
    WHEN 'YT' THEN v_tax_rate := 0.05;    v_tax_label := 'GST';
    ELSE
      RAISE EXCEPTION 'Unsupported Canadian province or territory'
        USING ERRCODE = '22023';
  END CASE;

  v_shipping :=
    _shipping_address
    || jsonb_build_object('province', v_province, 'country', 'Canada');

  v_billing :=
    COALESCE(_billing_address, v_shipping)
    || jsonb_build_object('country', 'Canada');

  IF _items IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Checkout must contain between 1 and 100 items'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_items) AS entry
    WHERE COALESCE(entry->>'product_id', '') = ''
       OR COALESCE(entry->>'quantity', '') !~ '^[0-9]+$'
       OR (entry->>'quantity')::integer < 1
       OR (entry->>'quantity')::integer > 99
  ) THEN
    RAISE EXCEPTION 'Each checkout item must have a valid product and quantity'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.orders
  WHERE checkout_idempotency_hash = v_idempotency_hash
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.customer_id IS DISTINCT FROM _customer_id
       OR lower(COALESCE(v_existing.customer_email, '')) <> v_email
       OR COALESCE(v_existing.promotion_code, '') <>
          COALESCE(v_requested_promotion_code, '') THEN
      RAISE EXCEPTION 'Checkout idempotency key conflict'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.payment_status <> 'paid'::public.payment_status
       AND v_existing.inventory_committed_at IS NULL
       AND v_existing.inventory_released_at IS NULL
       AND v_existing.inventory_reserved_until IS NOT NULL
       AND v_existing.inventory_reserved_until <= now() THEN
      PERFORM public.release_order_inventory(v_existing.id);
      RAISE EXCEPTION 'Checkout session expired; please submit again'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_existing.inventory_released_at IS NOT NULL
       AND v_existing.payment_status <> 'paid'::public.payment_status THEN
      RAISE EXCEPTION 'Checkout session expired; please submit again'
        USING ERRCODE = 'P0001';
    END IF;

    v_province := upper(
      COALESCE(v_existing.shipping_address->>'province', v_province)
    );

    RETURN jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'subtotal', v_existing.subtotal,
      'shipping_total', v_existing.shipping_total,
      'tax_total', v_existing.tax_total,
      'discount_total', v_existing.discount_total,
      'promotion_savings_total', v_existing.promotion_savings_total,
      'promotion_code', v_existing.promotion_code,
      'total', v_existing.total,
      'tax_label', CASE v_province
        WHEN 'QC' THEN 'GST + QST'
        WHEN 'BC' THEN 'GST + PST'
        WHEN 'MB' THEN 'GST + RST'
        WHEN 'SK' THEN 'GST + PST'
        WHEN 'AB' THEN 'GST'
        WHEN 'NT' THEN 'GST'
        WHEN 'NU' THEN 'GST'
        WHEN 'YT' THEN 'GST'
        ELSE 'HST'
      END,
      'province', v_province,
      'demo', false,
      'reused', true
    );
  END IF;

  IF _customer_id IS NULL THEN
    SELECT s.allow_guest_checkout
    INTO v_allow_guest_checkout
    FROM public.marketplace_settings AS s
    WHERE s.id = true;

    IF v_allow_guest_checkout IS NULL THEN
      RAISE EXCEPTION 'Marketplace checkout settings are unavailable'
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT v_allow_guest_checkout THEN
      RAISE EXCEPTION 'Guest checkout is disabled'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.orders (
    customer_id,
    customer_email,
    customer_phone,
    currency,
    subtotal,
    shipping_total,
    tax_total,
    discount_total,
    promotion_savings_total,
    total,
    status,
    payment_status,
    shipping_address,
    billing_address,
    checkout_idempotency_hash,
    inventory_reserved_until
  )
  VALUES (
    _customer_id,
    v_email,
    v_phone,
    'CAD',
    0,
    0,
    0,
    0,
    0,
    0,
    'pending'::public.order_status,
    'unpaid'::public.payment_status,
    v_shipping,
    v_billing,
    v_idempotency_hash,
    now() + interval '24 hours'
  )
  RETURNING id, order_number
  INTO v_order_id, v_order_number;

  FOR v_item IN
    SELECT
      (entry->>'product_id')::uuid AS product_id,
      sum((entry->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(_items) AS entry
    GROUP BY (entry->>'product_id')::uuid
  LOOP
    IF v_item.quantity < 1 OR v_item.quantity > 99 THEN
      RAISE EXCEPTION 'Combined product quantity must be between 1 and 99'
        USING ERRCODE = '22023';
    END IF;

    SELECT
      p.id,
      p.vendor_id,
      p.title,
      p.price,
      p.inventory_quantity,
      p.track_inventory,
      v.commission_rate
    INTO v_product
    FROM public.products AS p
    JOIN public.vendors AS v ON v.id = p.vendor_id
    WHERE p.id = v_item.product_id
      AND p.status = 'active'::public.product_status
      AND v.status = 'active'::public.vendor_status
      AND v.subscription_status IN ('active', 'trialing')
    FOR UPDATE OF p;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'One or more items are no longer available'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_product.track_inventory
       AND COALESCE(v_product.inventory_quantity, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient inventory for %', v_product.title
        USING ERRCODE = 'P0001';
    END IF;

    v_line_total := round((v_product.price * v_item.quantity)::numeric, 2);
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      vendor_id,
      title,
      quantity,
      unit_price,
      status,
      inventory_reserved
    )
    VALUES (
      v_order_id,
      v_product.id,
      v_product.vendor_id,
      v_product.title,
      v_item.quantity,
      v_product.price,
      'pending'::public.fulfillment_status,
      v_product.track_inventory
    );

    IF v_product.track_inventory THEN
      UPDATE public.products
      SET inventory_quantity = inventory_quantity - v_item.quantity,
          updated_at = now()
      WHERE id = v_product.id;
    END IF;
  END LOOP;

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Order subtotal must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET subtotal = v_subtotal
  WHERE id = v_order_id;

  SELECT
    CASE
      WHEN v_subtotal >= s.free_shipping_threshold THEN 0
      ELSE s.standard_shipping_fee
    END
  INTO v_base_shipping
  FROM public.marketplace_settings AS s
  WHERE s.id = true;

  IF v_base_shipping IS NULL THEN
    RAISE EXCEPTION 'Marketplace shipping settings are unavailable'
      USING ERRCODE = 'P0001';
  END IF;

  v_shipping_total := v_base_shipping;

  IF v_requested_promotion_code IS NOT NULL THEN
    v_promotion := public.reserve_order_promotion(
      v_order_id,
      v_requested_promotion_code,
      _customer_id,
      v_email,
      v_base_shipping
    );

    v_promotion_id := NULLIF(v_promotion->>'promotion_id', '')::uuid;
    v_applied_promotion_code := NULLIF(
      v_promotion->>'promotion_code',
      ''
    );
    v_discount_total := COALESCE(
      (v_promotion->>'merchandise_discount')::numeric,
      0
    );
    v_shipping_discount := COALESCE(
      (v_promotion->>'shipping_discount')::numeric,
      0
    );
    v_promotion_savings_total := COALESCE(
      (v_promotion->>'promotion_savings_total')::numeric,
      0
    );
    v_shipping_total := greatest(0, v_base_shipping - v_shipping_discount);
  END IF;

  v_tax_total := round(
    (greatest(0, v_subtotal - v_discount_total) * v_tax_rate)::numeric,
    2
  );
  v_total := round(
    (
      greatest(0, v_subtotal - v_discount_total)
      + v_shipping_total
      + v_tax_total
    )::numeric,
    2
  );

  UPDATE public.orders
  SET shipping_total = v_shipping_total,
      tax_total = v_tax_total,
      discount_total = v_discount_total,
      promotion_savings_total = v_promotion_savings_total,
      promotion_id = v_promotion_id,
      promotion_code = v_applied_promotion_code,
      total = v_total
  WHERE id = v_order_id;

  WITH vendor_totals AS (
    SELECT
      oi.vendor_id,
      round(sum(oi.unit_price * oi.quantity)::numeric, 2) AS subtotal,
      max(v.commission_rate) AS commission_rate
    FROM public.order_items AS oi
    JOIN public.vendors AS v ON v.id = oi.vendor_id
    WHERE oi.order_id = v_order_id
    GROUP BY oi.vendor_id
  )
  INSERT INTO public.vendor_orders (
    order_id,
    vendor_id,
    subtotal,
    commission_amount,
    vendor_payout_amount,
    status
  )
  SELECT
    v_order_id,
    vt.vendor_id,
    vt.subtotal,
    round((vt.subtotal * vt.commission_rate)::numeric, 2),
    round(
      (
        vt.subtotal
        - round((vt.subtotal * vt.commission_rate)::numeric, 2)
      )::numeric,
      2
    ),
    'pending'::public.vendor_order_status
  FROM vendor_totals AS vt;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping_total', v_shipping_total,
    'tax_total', v_tax_total,
    'discount_total', v_discount_total,
    'promotion_savings_total', v_promotion_savings_total,
    'promotion_code', v_applied_promotion_code,
    'total', v_total,
    'tax_label', v_tax_label,
    'province', v_province,
    'demo', false,
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) TO service_role;

COMMENT ON TABLE public.promotions IS
  'Server-validated 1LV.CA promotion definitions. Public rows are exposed only when active and explicitly listed.';
COMMENT ON TABLE public.promotion_redemptions IS
  'Promotion usage ledger. Checkout reserves usage; payment redeems it; expired checkout/refund can release it.';
COMMENT ON FUNCTION public.reserve_order_promotion(
  uuid, text, uuid, text, numeric
) IS
  'Validates promotion window, limits, first-order rule, include/exclude targets and computes trusted savings for an order.';


-- Finalize successful Stripe refunds as one financial transaction.
ALTER TABLE public.payout_adjustments
  ADD COLUMN IF NOT EXISTS refund_id uuid
  REFERENCES public.refund_records(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payout_adjustments_refund_unique
  ON public.payout_adjustments(refund_id)
  WHERE refund_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finalize_refund_accounting(
  _refund_id uuid,
  _stripe_refund_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refund public.refund_records%ROWTYPE;
  v_vendor_order public.vendor_orders%ROWTYPE;
  v_order_total numeric;
  v_reserved_total numeric := 0;
  v_refunded_total numeric := 0;
  v_payout_id uuid;
  v_payout_status public.payout_status;
  v_adjustment boolean := false;
  v_fully_refunded boolean := false;
  v_has_other_open_dispute boolean := false;
BEGIN
  IF _refund_id IS NULL
     OR _stripe_refund_id IS NULL
     OR btrim(_stripe_refund_id) = '' THEN
    RAISE EXCEPTION 'Refund id and Stripe refund id are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_refund
  FROM public.refund_records
  WHERE id = _refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund record not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT total
  INTO v_order_total
  FROM public.orders
  WHERE id = v_refund.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund order not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_refund.status = 'refunded'::public.refund_status THEN
    IF v_refund.stripe_refund_id IS DISTINCT FROM _stripe_refund_id THEN
      RAISE EXCEPTION 'Refund is already linked to a different Stripe refund'
        USING ERRCODE = '23505';
    END IF;

    SELECT COALESCE(sum(amount), 0)
    INTO v_refunded_total
    FROM public.refund_records
    WHERE order_id = v_refund.order_id
      AND status = 'refunded'::public.refund_status;

    SELECT EXISTS (
      SELECT 1
      FROM public.payout_adjustments
      WHERE refund_id = v_refund.id
    )
    INTO v_adjustment;

    RETURN jsonb_build_object(
      'ok', true,
      'already_finalized', true,
      'adjustment', v_adjustment,
      'fully_refunded', round(v_refunded_total, 2) >= round(v_order_total, 2)
    );
  END IF;

  IF v_refund.status NOT IN (
    'approved'::public.refund_status,
    'processing'::public.refund_status,
    'failed'::public.refund_status
  ) THEN
    RAISE EXCEPTION 'Refund is not eligible for finalization'
      USING ERRCODE = '22023';
  END IF;

  IF v_refund.amount <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(amount), 0)
  INTO v_reserved_total
  FROM public.refund_records
  WHERE order_id = v_refund.order_id
    AND id <> v_refund.id
    AND status IN (
      'approved'::public.refund_status,
      'processing'::public.refund_status,
      'refunded'::public.refund_status
    );

  IF round(v_reserved_total + v_refund.amount, 2) > round(v_order_total, 2) THEN
    RAISE EXCEPTION 'Refund would exceed order total'
      USING ERRCODE = '22023';
  END IF;

  IF v_refund.vendor_order_id IS NOT NULL THEN
    SELECT *
    INTO v_vendor_order
    FROM public.vendor_orders
    WHERE id = v_refund.vendor_order_id
    FOR UPDATE;

    IF FOUND THEN
      SELECT COALESCE(sum(amount), 0)
      INTO v_reserved_total
      FROM public.refund_records
      WHERE vendor_order_id = v_refund.vendor_order_id
        AND id <> v_refund.id
        AND status IN (
          'approved'::public.refund_status,
          'processing'::public.refund_status,
          'refunded'::public.refund_status
        );

      IF round(v_reserved_total + v_refund.amount, 2)
         > round(v_vendor_order.subtotal, 2) THEN
        RAISE EXCEPTION 'Refund would exceed vendor order subtotal'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  UPDATE public.refund_records
  SET status = 'refunded'::public.refund_status,
      stripe_refund_id = _stripe_refund_id,
      processed_at = now(),
      failure_reason = NULL,
      updated_at = now()
  WHERE id = v_refund.id;

  IF v_refund.vendor_order_id IS NOT NULL AND v_vendor_order.id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.disputes
      WHERE vendor_order_id = v_refund.vendor_order_id
        AND id IS DISTINCT FROM v_refund.dispute_id
        AND status IN (
          'open'::public.dispute_status,
          'under_review'::public.dispute_status,
          'waiting_customer'::public.dispute_status,
          'waiting_vendor'::public.dispute_status
        )
    )
    INTO v_has_other_open_dispute;

    UPDATE public.vendor_orders
    SET refund_amount = round(
          (COALESCE(refund_amount, 0) + v_refund.amount)::numeric,
          2
        ),
        dispute_hold_amount = CASE
          WHEN v_has_other_open_dispute THEN dispute_hold_amount
          ELSE 0
        END,
        updated_at = now()
    WHERE id = v_refund.vendor_order_id;

    SELECT payout_id
    INTO v_payout_id
    FROM public.payout_items
    WHERE vendor_order_id = v_refund.vendor_order_id
    LIMIT 1;

    IF v_payout_id IS NOT NULL THEN
      SELECT status
      INTO v_payout_status
      FROM public.payouts
      WHERE id = v_payout_id
      FOR UPDATE;

      IF v_payout_status IN (
        'paid'::public.payout_status,
        'processing'::public.payout_status
      ) THEN
        INSERT INTO public.payout_adjustments (
          vendor_id,
          vendor_order_id,
          payout_id,
          refund_id,
          kind,
          amount,
          note
        )
        VALUES (
          v_vendor_order.vendor_id,
          v_refund.vendor_order_id,
          v_payout_id,
          v_refund.id,
          'refund_clawback',
          -round(v_refund.amount::numeric, 2),
          'Stripe refund ' || _stripe_refund_id
        )
        ON CONFLICT (refund_id)
          WHERE refund_id IS NOT NULL
        DO NOTHING;

        SELECT EXISTS (
          SELECT 1
          FROM public.payout_adjustments
          WHERE refund_id = v_refund.id
        )
        INTO v_adjustment;
      ELSIF v_payout_status IS NOT NULL
            AND v_payout_status <> 'cancelled'::public.payout_status THEN
        UPDATE public.payouts
        SET status = 'held'::public.payout_status,
            updated_at = now()
        WHERE id = v_payout_id;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(sum(amount), 0)
  INTO v_refunded_total
  FROM public.refund_records
  WHERE order_id = v_refund.order_id
    AND status = 'refunded'::public.refund_status;

  v_fully_refunded :=
    round(v_refunded_total, 2) >= round(v_order_total, 2);

  UPDATE public.orders
  SET payment_status = CASE
        WHEN v_fully_refunded
          THEN 'refunded'::public.payment_status
        ELSE 'partially_refunded'::public.payment_status
      END,
      updated_at = now()
  WHERE id = v_refund.order_id;

  IF v_fully_refunded THEN
    PERFORM public.mark_order_promotion_refunded(v_refund.order_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_finalized', false,
    'adjustment', v_adjustment,
    'fully_refunded', v_fully_refunded
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_refund_accounting(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_refund_accounting(uuid, text)
  TO service_role;
