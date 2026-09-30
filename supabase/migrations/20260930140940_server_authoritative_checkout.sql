-- Server-authoritative checkout boundary for 1LV.CA.
--
-- The browser may no longer insert financial order rows directly. Production
-- checkout must call public.create_marketplace_order through the trusted app
-- server using the service-role client. One function call is one PostgreSQL
-- transaction, so parent order, items and vendor splits succeed or roll back
-- together.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_idempotency_key_uidx
  ON public.orders (checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_marketplace_order(
  _customer_id uuid,
  _customer_email text,
  _customer_phone text,
  _shipping_address jsonb,
  _billing_address jsonb,
  _items jsonb,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12,2) := 0;
  v_shipping_total numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_tax_rate numeric(8,5);
  v_tax_label text;
  v_province text;
  v_email text;
  v_phone text;
  v_shipping jsonb;
  v_billing jsonb;
  v_item record;
  v_product record;
  v_line_total numeric(12,2);
  v_existing record;
BEGIN
  IF _idempotency_key IS NULL
     OR length(_idempotency_key) < 16
     OR length(_idempotency_key) > 128
     OR _idempotency_key !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid checkout idempotency key'
      USING ERRCODE = '22023';
  END IF;

  v_email := lower(btrim(COALESCE(_customer_email, '')));
  IF length(v_email) < 5 OR length(v_email) > 320 OR position('@' IN v_email) <= 1 THEN
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

  SELECT
    o.id,
    o.order_number,
    o.customer_id,
    o.customer_email,
    o.subtotal,
    o.shipping_total,
    o.tax_total,
    o.discount_total,
    o.total
  INTO v_existing
  FROM public.orders AS o
  WHERE o.checkout_idempotency_key = _idempotency_key
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.customer_id IS DISTINCT FROM _customer_id
       OR lower(COALESCE(v_existing.customer_email, '')) <> v_email THEN
      RAISE EXCEPTION 'Checkout idempotency key conflict'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'subtotal', v_existing.subtotal,
      'shipping_total', v_existing.shipping_total,
      'tax_total', v_existing.tax_total,
      'discount_total', v_existing.discount_total,
      'total', v_existing.total,
      'tax_label', v_tax_label,
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
    checkout_idempotency_key
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
    _idempotency_key
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
    IF v_item.quantity IS NULL OR v_item.quantity < 1 OR v_item.quantity > 99 THEN
      RAISE EXCEPTION 'Item quantity must be between 1 and 99'
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
    JOIN public.vendors AS v
      ON v.id = p.vendor_id
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
      status
    )
    VALUES (
      v_order_id,
      v_product.id,
      v_product.vendor_id,
      v_product.title,
      v_item.quantity,
      v_product.price,
      'pending'::public.fulfillment_status
    );
  END LOOP;

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Order subtotal must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  v_shipping_total :=
    CASE WHEN v_subtotal >= 49 THEN 0 ELSE 7.99 END;

  v_tax_total := round((v_subtotal * v_tax_rate)::numeric, 2);
  v_total := round(
    (v_subtotal + v_shipping_total + v_tax_total - v_discount_total)::numeric,
    2
  );

  UPDATE public.orders
  SET
    subtotal = v_subtotal,
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
    JOIN public.vendors AS v
      ON v.id = oi.vendor_id
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
    'total', v_total,
    'tax_label', v_tax_label,
    'province', v_province,
    'demo', false,
    'reused', false
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT
      o.id,
      o.order_number,
      o.customer_id,
      o.customer_email,
      o.subtotal,
      o.shipping_total,
      o.tax_total,
      o.discount_total,
      o.total
    INTO v_existing
    FROM public.orders AS o
    WHERE o.checkout_idempotency_key = _idempotency_key
    LIMIT 1;

    IF FOUND
       AND v_existing.customer_id IS NOT DISTINCT FROM _customer_id
       AND lower(COALESCE(v_existing.customer_email, '')) = v_email THEN
      RETURN jsonb_build_object(
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'subtotal', v_existing.subtotal,
        'shipping_total', v_existing.shipping_total,
        'tax_total', v_existing.tax_total,
        'discount_total', v_existing.discount_total,
        'total', v_existing.total,
        'tax_label', v_tax_label,
        'province', v_province,
        'demo', false,
        'reused', true
      );
    END IF;

    RAISE;
END;
$$;

-- This function is intentionally *not* a public RPC. Only the app server's
-- service-role client may execute it.
REVOKE ALL ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, text
) TO service_role;

-- Remove browser-side financial INSERT paths. Admin/service-role operations
-- continue to work through their existing policies/privileges.
DROP POLICY IF EXISTS "Customers create own orders" ON public.orders;
DROP POLICY IF EXISTS "Guests can create guest orders" ON public.orders;
DROP POLICY IF EXISTS "Customers create own order items" ON public.order_items;
DROP POLICY IF EXISTS "Guests can create guest order items" ON public.order_items;
DROP POLICY IF EXISTS "Checkout can insert vendor orders" ON public.vendor_orders;

REVOKE INSERT ON public.orders FROM anon;
REVOKE INSERT ON public.order_items FROM anon;
REVOKE INSERT ON public.vendor_orders FROM anon;

COMMENT ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, text
) IS
  'Trusted 1LV.CA checkout transaction. Service-role only; validates products, sellers, inventory, Canada tax estimate, commissions and idempotency.';
