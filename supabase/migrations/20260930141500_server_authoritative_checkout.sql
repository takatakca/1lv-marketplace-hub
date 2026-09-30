-- Server-authoritative, atomic checkout for 1LV.CA.
-- This migration closes direct browser inserts into financial order tables and
-- introduces one service-role-only RPC that prices, validates, reserves
-- inventory, creates vendor splits, and returns the final stored totals.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_key_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_key_hash_uidx
  ON public.orders (checkout_key_hash)
  WHERE checkout_key_hash IS NOT NULL;

-- Replace the small random order-number default with a monotonic marketplace
-- reference suitable for long-running production use.
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 100000000;
ALTER TABLE public.orders
  ALTER COLUMN order_number
  SET DEFAULT ('1LV-' || lpad(nextval('public.order_number_seq')::text, 9, '0'));

-- Browser clients may read only through their existing SELECT policies/RPCs.
-- All production order creation now goes through create_marketplace_order().
DROP POLICY IF EXISTS "Customers create own orders" ON public.orders;
DROP POLICY IF EXISTS "Guests can create guest orders" ON public.orders;
DROP POLICY IF EXISTS "Customers create own order items" ON public.order_items;
DROP POLICY IF EXISTS "Guests can create guest order items" ON public.order_items;
DROP POLICY IF EXISTS "Checkout can insert vendor orders" ON public.vendor_orders;

-- The old guest lookup relied only on a six-digit order number. Remove it.
REVOKE ALL ON FUNCTION public.lookup_guest_order(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_guest_order(text) FROM anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.lookup_guest_order(text);

-- Guest lookup now requires both the order number and the high-entropy checkout key.
CREATE OR REPLACE FUNCTION public.lookup_guest_order(
  _order_number text,
  _checkout_key text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  )
  FROM public.orders o
  WHERE o.order_number = _order_number
    AND o.customer_id IS NULL
    AND o.checkout_key_hash = encode(
      extensions.digest(convert_to(COALESCE(_checkout_key, ''), 'UTF8'), 'sha256'),
      'hex'
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_guest_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_guest_order(text, text) TO anon, authenticated, service_role;

-- Commission rates are no longer needed by browser checkout.
REVOKE ALL ON FUNCTION public.get_vendor_commission_rates(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vendor_commission_rates(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_commission_rates(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.create_marketplace_order(
  _checkout_key text,
  _customer_id uuid,
  _customer_email text,
  _customer_phone text,
  _shipping_address jsonb,
  _billing_address jsonb,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_checkout_hash text;
  v_existing public.orders%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_shipping jsonb;
  v_billing jsonb;
  v_province text;
  v_subtotal numeric(12,2);
  v_shipping_total numeric(12,2);
  v_tax_rate numeric(8,5);
  v_tax_total numeric(12,2);
  v_total numeric(12,2);
  v_requested_count integer;
  v_distinct_count integer;
  v_valid_count integer;
BEGIN
  IF _checkout_key IS NULL OR length(_checkout_key) < 32 THEN
    RAISE EXCEPTION 'Invalid checkout key';
  END IF;

  IF _customer_email IS NULL OR length(trim(_customer_email)) < 5 OR length(_customer_email) > 320 THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  IF jsonb_typeof(_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Checkout items are invalid';
  END IF;

  v_province := upper(trim(COALESCE(_shipping_address->>'province', '')));
  IF v_province NOT IN ('AB','BC','MB','NB','NL','NT','NS','NU','ON','PE','QC','SK','YT') THEN
    RAISE EXCEPTION 'A valid Canadian province or territory is required';
  END IF;

  IF COALESCE(trim(_shipping_address->>'first_name'), '') = ''
     OR COALESCE(trim(_shipping_address->>'last_name'), '') = ''
     OR COALESCE(trim(_shipping_address->>'address'), '') = ''
     OR COALESCE(trim(_shipping_address->>'city'), '') = ''
     OR COALESCE(trim(_shipping_address->>'postal_code'), '') = '' THEN
    RAISE EXCEPTION 'Complete shipping address is required';
  END IF;

  v_shipping := jsonb_set(
    jsonb_set(COALESCE(_shipping_address, '{}'::jsonb), '{province}', to_jsonb(v_province), true),
    '{country}',
    '"Canada"'::jsonb,
    true
  );

  v_billing := COALESCE(_billing_address, v_shipping);
  v_billing := jsonb_set(
    v_billing,
    '{country}',
    '"Canada"'::jsonb,
    true
  );

  v_checkout_hash := encode(
    extensions.digest(convert_to(_checkout_key, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Serialize duplicate/retried submissions using the same checkout key.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_checkout_hash, 0));

  SELECT *
  INTO v_existing
  FROM public.orders
  WHERE checkout_key_hash = v_checkout_hash
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.customer_id IS DISTINCT FROM _customer_id
       OR lower(COALESCE(v_existing.customer_email, '')) <> lower(trim(_customer_email)) THEN
      RAISE EXCEPTION 'Checkout key is already in use';
    END IF;

    RETURN jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'subtotal', v_existing.subtotal,
      'shipping_total', v_existing.shipping_total,
      'tax_total', v_existing.tax_total,
      'discount_total', v_existing.discount_total,
      'total', v_existing.total,
      'province', v_province,
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
      END
    );
  END IF;

  SELECT count(*)
  INTO v_requested_count
  FROM jsonb_to_recordset(_items) AS item(product_id uuid, quantity integer);

  SELECT count(DISTINCT item.product_id)
  INTO v_distinct_count
  FROM jsonb_to_recordset(_items) AS item(product_id uuid, quantity integer)
  WHERE item.quantity BETWEEN 1 AND 99;

  IF v_requested_count <> v_distinct_count THEN
    RAISE EXCEPTION 'Each product must appear once with a quantity from 1 to 99';
  END IF;

  -- Lock purchasable product rows before inventory validation and decrement.
  PERFORM p.id
  FROM public.products p
  JOIN jsonb_to_recordset(_items) AS item(product_id uuid, quantity integer)
    ON item.product_id = p.id
  JOIN public.vendors v ON v.id = p.vendor_id
  WHERE p.status = 'active'
    AND v.status = 'active'
    AND v.subscription_status IN ('active', 'trialing')
  FOR UPDATE OF p;

  SELECT count(*)
  INTO v_valid_count
  FROM public.products p
  JOIN jsonb_to_recordset(_items) AS item(product_id uuid, quantity integer)
    ON item.product_id = p.id
  JOIN public.vendors v ON v.id = p.vendor_id
  WHERE p.status = 'active'
    AND v.status = 'active'
    AND v.subscription_status IN ('active', 'trialing')
    AND item.quantity BETWEEN 1 AND 99;

  IF v_valid_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more products are unavailable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.products p
    JOIN jsonb_to_recordset(_items) AS item(product_id uuid, quantity integer)
      ON item.product_id = p.id
    WHERE p.track_inventory
      AND p.inventory_quantity < item.quantity
  ) THEN
    RAISE EXCEPTION 'One or more products do not have enough inventory';
  END IF;

  SELECT round(COALESCE(sum(p.price * item.quantity), 0)::numeric, 2)
  INTO v_subtotal
  FROM public.products p
  JOIN jsonb_to_recordset(_items) AS item(product_id uuid, quantity integer)
    ON item.product_id = p.id;

  v_shipping_total := CASE WHEN v_subtotal >= 49 THEN 0 ELSE 7.99 END;

  v_tax_rate := CASE v_province
    WHEN 'AB' THEN 0.05
    WHEN 'BC' THEN 0.12
    WHEN 'MB' THEN 0.12
    WHEN 'NB' THEN 0.15
    WHEN 'NL' THEN 0.15
    WHEN 'NT' THEN 0.05
    WHEN 'NS' THEN 0.14
    WHEN 'NU' THEN 0.05
    WHEN 'ON' THEN 0.13
    WHEN 'PE' THEN 0.15
    WHEN 'QC' THEN 0.14975
    WHEN 'SK' THEN 0.11
    WHEN 'YT' THEN 0.05
  END;

  v_tax_total := round((v_subtotal * v_tax_rate)::numeric, 2);
  v_total := round((v_subtotal + v_shipping_total + v_tax_total)::numeric, 2);

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
    checkout_key_hash
  )
  VALUES (
    _customer_id,
    lower(trim(_customer_email)),
    NULLIF(trim(COALESCE(_customer_phone, '')), ''),
    'CAD',
    v_subtotal,
    v_shipping_total,
    v_tax_total,
    0,
    v_total,
    'pending',
    'unpaid',
    v_shipping,
    v_billing,
    v_checkout_hash
  )
  RETURNING *
  INTO v_order;

  INSERT INTO public.order_items (
    order_id,
    product_id,
    vendor_id,
    title,
    quantity,
    unit_price,
    status
  )
  SELECT
    v_order.id,
    p.id,
    p.vendor_id,
    p.title,
    item.quantity,
    p.price,
    'pending'::public.fulfillment_status
  FROM public.products p
  JOIN jsonb_to_recordset(_items) AS item(product_id uuid, quantity integer)
    ON item.product_id = p.id;

  INSERT INTO public.vendor_orders (
    order_id,
    vendor_id,
    subtotal,
    commission_amount,
    vendor_payout_amount,
    status
  )
  SELECT
    v_order.id,
    p.vendor_id,
    round(sum(p.price * item.quantity)::numeric, 2),
    round((sum(p.price * item.quantity) * v.commission_rate)::numeric, 2),
    round((sum(p.price * item.quantity) * (1 - v.commission_rate))::numeric, 2),
    'pending'::public.vendor_order_status
  FROM public.products p
  JOIN jsonb_to_recordset(_items) AS item(product_id uuid, quantity integer)
    ON item.product_id = p.id
  JOIN public.vendors v ON v.id = p.vendor_id
  GROUP BY p.vendor_id, v.commission_rate;

  UPDATE public.products p
  SET inventory_quantity = p.inventory_quantity - requested.quantity,
      updated_at = now()
  FROM (
    SELECT item.product_id, item.quantity
    FROM jsonb_to_recordset(_items) AS item(product_id uuid, quantity integer)
  ) AS requested
  WHERE p.id = requested.product_id
    AND p.track_inventory;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'subtotal', v_order.subtotal,
    'shipping_total', v_order.shipping_total,
    'tax_total', v_order.tax_total,
    'discount_total', v_order.discount_total,
    'total', v_order.total,
    'province', v_province,
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
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order(
  text, uuid, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(
  text, uuid, text, text, jsonb, jsonb, jsonb
) TO service_role;
