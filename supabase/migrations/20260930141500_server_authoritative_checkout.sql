-- 1LV.CA server-authoritative checkout.
--
-- One SECURITY DEFINER function owns the financial transaction boundary:
-- product/seller validation, inventory locking, DB prices, Canada tax estimate,
-- vendor commission splits and order creation happen in one PostgreSQL
-- transaction. Browser clients cannot insert financial order rows directly.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_idempotency_hash text,
  ADD COLUMN IF NOT EXISTS inventory_reserved_until timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_committed_at timestamptz;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS inventory_reserved boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS orders_inventory_reservation_idx
  ON public.orders (inventory_reserved_until)
  WHERE inventory_reserved_until IS NOT NULL
    AND inventory_released_at IS NULL
    AND inventory_committed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_idempotency_hash_uidx
  ON public.orders (checkout_idempotency_hash)
  WHERE checkout_idempotency_hash IS NOT NULL;

-- Use a collision-resistant production order reference instead of the original
-- six-digit random default.
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 100000000;
ALTER SEQUENCE public.order_number_seq OWNED BY public.orders.order_number;
ALTER TABLE public.orders
  ALTER COLUMN order_number
  SET DEFAULT ('1LV-' || lpad(nextval('public.order_number_seq')::text, 9, '0'));

-- Remove browser-side financial INSERT paths. Authenticated admins retain their
-- existing admin RLS policy; the service role bypasses RLS for the trusted RPC.
DROP POLICY IF EXISTS "Customers create own orders" ON public.orders;
DROP POLICY IF EXISTS "Guests can create guest orders" ON public.orders;
DROP POLICY IF EXISTS "Customers create own order items" ON public.order_items;
DROP POLICY IF EXISTS "Guests can create guest order items" ON public.order_items;
DROP POLICY IF EXISTS "Checkout can insert vendor orders" ON public.vendor_orders;

REVOKE INSERT ON public.orders FROM anon, authenticated;
REVOKE INSERT ON public.order_items FROM anon, authenticated;
REVOKE INSERT ON public.vendor_orders FROM anon, authenticated;

-- The browser no longer needs direct access to private commission rates.
REVOKE ALL ON FUNCTION public.get_vendor_commission_rates(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vendor_commission_rates(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_commission_rates(uuid[]) TO service_role;

-- Remove the legacy guest lookup that was protected only by a short order number,
-- plus any previous two-argument experimental overload.
REVOKE ALL ON FUNCTION public.lookup_guest_order(text) FROM PUBLIC;
DROP FUNCTION IF EXISTS public.lookup_guest_order(text);
DROP FUNCTION IF EXISTS public.lookup_guest_order(text, text);
DROP FUNCTION IF EXISTS public.lookup_guest_order(text, uuid);

CREATE OR REPLACE FUNCTION public.release_order_inventory(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $
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

  UPDATE public.orders
  SET inventory_reserved_until = NULL,
      inventory_released_at = now(),
      updated_at = now()
  WHERE id = _order_id;

  RETURN true;
END;
$;

REVOKE ALL ON FUNCTION public.release_order_inventory(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.release_expired_inventory_reservations(
  _limit integer DEFAULT 50
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $
DECLARE
  v_order_id uuid;
  v_released integer := 0;
BEGIN
  FOR v_order_id IN
    SELECT id
    FROM public.orders
    WHERE inventory_reserved_until IS NOT NULL
      AND inventory_reserved_until <= now()
      AND inventory_released_at IS NULL
      AND inventory_committed_at IS NULL
      AND payment_status IN (
        'unpaid'::public.payment_status,
        'failed'::public.payment_status
      )
    ORDER BY inventory_reserved_until
    LIMIT greatest(1, least(COALESCE(_limit, 50), 250))
    FOR UPDATE SKIP LOCKED
  LOOP
    IF public.release_order_inventory(v_order_id) THEN
      v_released := v_released + 1;
    END IF;
  END LOOP;

  RETURN v_released;
END;
$;

REVOKE ALL ON FUNCTION public.release_expired_inventory_reservations(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_inventory_reservations(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.commit_order_inventory(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $
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

  UPDATE public.orders
  SET inventory_reserved_until = NULL,
      inventory_committed_at = now(),
      updated_at = now()
  WHERE id = _order_id;

  RETURN true;
END;
$;

REVOKE ALL ON FUNCTION public.commit_order_inventory(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_order_inventory(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_marketplace_order(
  _customer_id uuid,
  _customer_email text,
  _customer_phone text,
  _shipping_address jsonb,
  _billing_address jsonb,
  _items jsonb,
  _idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $
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
  v_tax_total numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_item record;
  v_product record;
  v_line_total numeric(12,2);
BEGIN
  PERFORM public.release_expired_inventory_reservations(50);

  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Invalid checkout idempotency key'
      USING ERRCODE = '22023';
  END IF;

  v_idempotency_hash := encode(
    extensions.digest(convert_to(_idempotency_key::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Serialize retries using the same checkout key before reading or inserting.
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
    IF v_existing.customer_id IS DISTINCT FROM _customer_id
       OR lower(COALESCE(v_existing.customer_email, '')) <> v_email THEN
      RAISE EXCEPTION 'Checkout idempotency key conflict'
        USING ERRCODE = '23505';
    END IF;

    v_province := upper(COALESCE(v_existing.shipping_address->>'province', v_province));

    RETURN jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'subtotal', v_existing.subtotal,
      'shipping_total', v_existing.shipping_total,
      'tax_total', v_existing.tax_total,
      'discount_total', v_existing.discount_total,
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

  INSERT INTO public.orders (
    customer_id,
    customer_email,
    customer_phone,
    currency,
    subtotal,
    shipping_total,
    tax_total,
    discount_total,
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

  v_shipping_total := CASE WHEN v_subtotal >= 49 THEN 0 ELSE 7.99 END;
  v_tax_total := round((v_subtotal * v_tax_rate)::numeric, 2);
  v_total := round(
    (v_subtotal + v_shipping_total + v_tax_total - v_discount_total)::numeric,
    2
  );

  UPDATE public.orders
  SET subtotal = v_subtotal,
      shipping_total = v_shipping_total,
      tax_total = v_tax_total,
      discount_total = v_discount_total,
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
    round((vt.subtotal - round((vt.subtotal * vt.commission_rate)::numeric, 2))::numeric, 2),
    'pending'::public.vendor_order_status
  FROM vendor_totals AS vt;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping_total', v_shipping_total,
    'tax_total', v_tax_total,
    'discount_total', v_discount_total,
    'total', v_total,
    'tax_label', v_tax_label,
    'province', v_province,
    'demo', false,
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, uuid
) TO service_role;

-- Guest order details require the short public order reference plus the original
-- high-entropy UUID checkout capability. The database stores only its SHA-256 hash.
CREATE OR REPLACE FUNCTION public.lookup_guest_order(
  _order_number text,
  _checkout_key uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'total', o.total,
    'status', o.status,
    'payment_status', o.payment_status,
    'created_at', o.created_at,
    'order_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'title', oi.title,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'status', oi.status,
        'tracking_number', oi.tracking_number,
        'carrier', oi.carrier
      ) ORDER BY oi.created_at)
      FROM public.order_items AS oi
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  )
  FROM public.orders AS o
  WHERE o.order_number = _order_number
    AND o.customer_id IS NULL
    AND o.checkout_idempotency_hash = encode(
      extensions.digest(convert_to(_checkout_key::text, 'UTF8'), 'sha256'),
      'hex'
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_guest_order(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_guest_order(text, uuid)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, uuid
) IS
  'Trusted 1LV.CA checkout transaction: validates sellers/products, reserves inventory for 24 hours, calculates stored totals and creates vendor splits atomically.';
