-- SKU-authoritative checkout.
-- Extends the already-certified checkout engine with optional variant_id while
-- preserving taxes, promotions, guest checkout, Stripe and payout boundaries.

CREATE OR REPLACE FUNCTION public.assert_checkout_items_safe(_items jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
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
    WHERE COALESCE(entry->>'product_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (
        COALESCE(entry->>'variant_id', '') <> ''
        AND COALESCE(entry->>'variant_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      OR COALESCE(entry->>'quantity', '') !~ '^[1-9][0-9]?$'
  ) THEN
    RAISE EXCEPTION
      'Each checkout item must have a valid product, optional variant and quantity'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_items) AS entry
    GROUP BY
      (entry->>'product_id')::uuid,
      NULLIF(entry->>'variant_id', '')::uuid
    HAVING sum((entry->>'quantity')::integer) > 99
  ) THEN
    RAISE EXCEPTION 'Combined SKU quantity must be between 1 and 99'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_checkout_items_safe(jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_checkout_items_safe(jsonb)
TO service_role;

CREATE OR REPLACE FUNCTION public.create_marketplace_order_unchecked(
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
VOLATILE
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
  v_variant public.product_variants%ROWTYPE;
  v_variant_options jsonb;
  v_unit_price numeric(12,2);
  v_reserve_inventory boolean;
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

  PERFORM public.assert_checkout_items_safe(_items);

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

    IF v_existing.payment_status NOT IN (
         'paid'::public.payment_status,
         'partially_refunded'::public.payment_status,
         'refunded'::public.payment_status
       )
       AND v_existing.inventory_committed_at IS NULL
       AND v_existing.inventory_released_at IS NULL
       AND v_existing.inventory_reserved_until IS NOT NULL
       AND v_existing.inventory_reserved_until <= now() THEN
      PERFORM public.release_order_inventory(
        v_existing.id,
        v_existing.stripe_payment_intent_id
      );
      RAISE EXCEPTION 'Checkout session expired; please submit again'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_existing.inventory_released_at IS NOT NULL
       AND v_existing.payment_status NOT IN (
         'paid'::public.payment_status,
         'partially_refunded'::public.payment_status,
         'refunded'::public.payment_status
       ) THEN
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
      NULLIF(entry->>'variant_id', '')::uuid AS variant_id,
      sum((entry->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(_items) AS entry
    GROUP BY
      (entry->>'product_id')::uuid,
      NULLIF(entry->>'variant_id', '')::uuid
    ORDER BY
      (entry->>'product_id')::uuid,
      NULLIF(entry->>'variant_id', '')::uuid NULLS FIRST
  LOOP
    IF v_item.quantity < 1 OR v_item.quantity > 99 THEN
      RAISE EXCEPTION 'Combined SKU quantity must be between 1 and 99'
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

    v_variant_options := NULL;

    IF v_item.variant_id IS NOT NULL THEN
      SELECT *
      INTO v_variant
      FROM public.product_variants
      WHERE id = v_item.variant_id
        AND product_id = v_product.id
        AND vendor_id = v_product.vendor_id
        AND active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected product variant is no longer available'
          USING ERRCODE = 'P0001';
      END IF;

      v_unit_price := v_variant.price;
      v_reserve_inventory := v_variant.track_inventory;

      IF v_variant.track_inventory
         AND v_variant.inventory_quantity < v_item.quantity THEN
        RAISE EXCEPTION 'Insufficient inventory for selected SKU %',
          v_variant.sku
          USING ERRCODE = 'P0001';
      END IF;

      SELECT COALESCE(
        jsonb_object_agg(po.name, pov.value ORDER BY po.position),
        '{}'::jsonb
      )
      INTO v_variant_options
      FROM public.product_variant_option_values AS pvov
      JOIN public.product_options AS po
        ON po.id = pvov.option_id
      JOIN public.product_option_values AS pov
        ON pov.id = pvov.option_value_id
      WHERE pvov.variant_id = v_variant.id;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.product_variants AS pv
        WHERE pv.product_id = v_product.id
          AND pv.active = true
      ) THEN
        RAISE EXCEPTION 'A product variant must be selected'
          USING ERRCODE = '22023';
      END IF;

      v_unit_price := v_product.price;
      v_reserve_inventory := v_product.track_inventory;

      IF v_product.track_inventory
         AND COALESCE(v_product.inventory_quantity, 0) < v_item.quantity THEN
        RAISE EXCEPTION 'Insufficient inventory for %', v_product.title
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    v_line_total := round((v_unit_price * v_item.quantity)::numeric, 2);
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      variant_sku,
      variant_options,
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
      v_item.variant_id,
      CASE WHEN v_item.variant_id IS NULL THEN NULL ELSE v_variant.sku END,
      v_variant_options,
      v_product.vendor_id,
      v_product.title,
      v_item.quantity,
      v_unit_price,
      'pending'::public.fulfillment_status,
      v_reserve_inventory
    );

    IF v_reserve_inventory THEN
      IF v_item.variant_id IS NOT NULL THEN
        UPDATE public.product_variants
        SET inventory_quantity = inventory_quantity - v_item.quantity,
            updated_at = now()
        WHERE id = v_variant.id;
      ELSE
        UPDATE public.products
        SET inventory_quantity = inventory_quantity - v_item.quantity,
            updated_at = now()
        WHERE id = v_product.id;
      END IF;
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

REVOKE ALL ON FUNCTION public.create_marketplace_order_unchecked(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_unchecked(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.create_marketplace_order_locked_unchecked(
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
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_product_id uuid;
  v_variant_id uuid;
  v_idempotency_hash text;
  v_request_hash text;
  v_existing_request_hash text;
  v_result jsonb;
  v_result_order_id uuid;
  v_normalized_items jsonb;
BEGIN
  PERFORM public.assert_checkout_items_safe(_items);

  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Invalid checkout idempotency key'
      USING ERRCODE = '22023';
  END IF;

  v_idempotency_hash := encode(
    extensions.digest(
      convert_to(_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_idempotency_hash, 0)
  );

  SELECT jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'variant_id', variant_id,
      'quantity', quantity
    )
    ORDER BY product_id, variant_id NULLS FIRST
  )
  INTO v_normalized_items
  FROM (
    SELECT
      (entry->>'product_id')::uuid AS product_id,
      NULLIF(entry->>'variant_id', '')::uuid AS variant_id,
      sum((entry->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(_items) AS entry
    GROUP BY
      (entry->>'product_id')::uuid,
      NULLIF(entry->>'variant_id', '')::uuid
  ) AS normalized;

  v_request_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'customer_id', _customer_id,
          'customer_email', lower(btrim(COALESCE(_customer_email, ''))),
          'customer_phone', NULLIF(btrim(COALESCE(_customer_phone, '')), ''),
          'shipping_address', _shipping_address,
          'billing_address', _billing_address,
          'items', v_normalized_items,
          'promotion_code',
            NULLIF(upper(btrim(COALESCE(_promotion_code, ''))), '')
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  SELECT checkout_request_hash
  INTO v_existing_request_hash
  FROM public.orders
  WHERE checkout_idempotency_hash = v_idempotency_hash
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_request_hash IS NULL THEN
      RAISE EXCEPTION
        'Checkout idempotency key predates payload binding; please submit again'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing_request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'Checkout idempotency key conflict'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  FOR v_product_id IN
    SELECT DISTINCT (entry->>'product_id')::uuid
    FROM jsonb_array_elements(_items) AS entry
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_product_id::text, 42117)
    );
  END LOOP;

  FOR v_variant_id IN
    SELECT DISTINCT NULLIF(entry->>'variant_id', '')::uuid
    FROM jsonb_array_elements(_items) AS entry
    WHERE NULLIF(entry->>'variant_id', '') IS NOT NULL
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_variant_id::text, 42118)
    );
  END LOOP;

  v_result := public.create_marketplace_order(
    _customer_id,
    _customer_email,
    _customer_phone,
    _shipping_address,
    _billing_address,
    _items,
    _idempotency_key,
    _promotion_code
  );

  v_result_order_id := NULLIF(v_result->>'order_id', '')::uuid;
  IF v_result_order_id IS NULL THEN
    RAISE EXCEPTION 'Checkout did not return an order id'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orders
  SET checkout_request_hash = v_request_hash
  WHERE id = v_result_order_id
    AND checkout_request_hash IS NULL;

  SELECT checkout_request_hash
  INTO v_existing_request_hash
  FROM public.orders
  WHERE id = v_result_order_id
  FOR UPDATE;

  IF v_existing_request_hash IS DISTINCT FROM v_request_hash THEN
    RAISE EXCEPTION 'Checkout request fingerprint mismatch'
      USING ERRCODE = '23505';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order_locked_unchecked(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_locked_unchecked(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_order_inventory(
  _order_id uuid,
  _expected_payment_intent_id text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
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
     OR v_order.payment_status IN (
       'paid'::public.payment_status,
       'partially_refunded'::public.payment_status,
       'refunded'::public.payment_status
     )
     OR v_order.inventory_committed_at IS NOT NULL
     OR v_order.inventory_released_at IS NOT NULL
     OR v_order.inventory_reserved_until IS NULL
     OR v_order.inventory_reserved_until > now()
     OR v_order.stripe_payment_intent_id
        IS DISTINCT FROM _expected_payment_intent_id THEN
    RETURN false;
  END IF;

  FOR v_item IN
    SELECT variant_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = _order_id
      AND inventory_reserved = true
      AND variant_id IS NOT NULL
    GROUP BY variant_id
  LOOP
    UPDATE public.product_variants
    SET inventory_quantity = inventory_quantity + v_item.quantity,
        updated_at = now()
    WHERE id = v_item.variant_id;
  END LOOP;

  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = _order_id
      AND inventory_reserved = true
      AND variant_id IS NULL
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
      released_at = COALESCE(released_at, now())
  WHERE order_id = _order_id
    AND status = 'reserved';

  UPDATE public.orders
  SET inventory_reserved_until = NULL,
      inventory_released_at = now(),
      payment_status = 'failed'::public.payment_status,
      status = 'cancelled'::public.order_status,
      updated_at = now()
  WHERE id = _order_id
    AND inventory_committed_at IS NULL
    AND inventory_released_at IS NULL
    AND inventory_reserved_until IS NOT NULL
    AND inventory_reserved_until <= now()
    AND stripe_payment_intent_id IS NOT DISTINCT FROM _expected_payment_intent_id
    AND payment_status IN (
      'unpaid'::public.payment_status,
      'failed'::public.payment_status
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.release_order_inventory(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid, text)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003024500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
