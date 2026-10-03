-- Include the customer-paid delivery charge in the taxable checkout base.
-- Existing/in-flight orders are intentionally not rewritten: this correction
-- applies only while a new checkout is still unpaid and has no Stripe
-- PaymentIntent, so an already-authorized Stripe amount can never be changed
-- behind the customer's back.
--
-- CRA guidance treats ordinary Canadian delivery/freight services as taxable
-- supplies at the applicable destination rate. 1LV's current simplified tax
-- model already treats merchandise as taxable at one provincial rate, so the
-- same rate must apply to the net delivery charge collected from the customer.

CREATE OR REPLACE FUNCTION public.recalculate_new_checkout_tax(
  _order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_province text;
  v_tax_rate numeric(8,5);
  v_tax_label text;
  v_taxable_merchandise numeric(12,2);
  v_taxable_shipping numeric(12,2);
  v_tax_total numeric(12,2);
  v_total numeric(12,2);
BEGIN
  IF _order_id IS NULL THEN
    RAISE EXCEPTION 'Checkout order id is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout order not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment_status <> 'unpaid'::public.payment_status
     OR v_order.stripe_payment_intent_id IS NOT NULL
     OR v_order.inventory_committed_at IS NOT NULL
     OR v_order.inventory_released_at IS NOT NULL THEN
    RAISE EXCEPTION
      'Checkout tax cannot be changed after payment authorization or inventory finalization'
      USING ERRCODE = '55000';
  END IF;

  v_province := upper(
    btrim(COALESCE(v_order.shipping_address->>'province', ''))
  );

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

  v_taxable_merchandise := round(
    GREATEST(
      COALESCE(v_order.subtotal, 0)
      - COALESCE(v_order.discount_total, 0),
      0
    )::numeric,
    2
  );

  -- shipping_total is already net of any free-shipping promotion.
  v_taxable_shipping := round(
    GREATEST(COALESCE(v_order.shipping_total, 0), 0)::numeric,
    2
  );

  v_tax_total := round(
    (
      (v_taxable_merchandise + v_taxable_shipping)
      * v_tax_rate
    )::numeric,
    2
  );

  v_total := round(
    (
      v_taxable_merchandise
      + v_taxable_shipping
      + v_tax_total
    )::numeric,
    2
  );

  UPDATE public.orders
  SET
    tax_total = v_tax_total,
    total = v_total,
    updated_at = now()
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'tax_total', v_tax_total,
    'total', v_total,
    'tax_label', v_tax_label,
    'province', v_province
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_new_checkout_tax(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_new_checkout_tax(uuid)
TO service_role;


CREATE OR REPLACE FUNCTION public.create_marketplace_order(
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
  v_email text := lower(btrim(COALESCE(_customer_email, '')));
  v_phone text := NULLIF(btrim(COALESCE(_customer_phone, '')), '');
  v_shipping jsonb;
  v_billing jsonb;
  v_result jsonb;
  v_tax jsonb;
  v_order_id uuid;
  v_reused boolean := false;
BEGIN
  PERFORM public.assert_checkout_items_safe(_items);

  IF length(v_email) < 5
     OR length(v_email) > 320
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_email ~* '@auth\.1lv\.ca$' THEN
    RAISE EXCEPTION 'A valid customer email address is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Customer phone is too long'
      USING ERRCODE = '22023';
  END IF;

  v_shipping := public.normalize_canadian_checkout_address(
    _shipping_address,
    'Shipping'
  );

  v_billing := CASE
    WHEN _billing_address IS NULL THEN NULL
    ELSE public.normalize_canadian_checkout_address(
      _billing_address,
      'Billing'
    )
  END;

  v_result := public.create_marketplace_order_unchecked(
    _customer_id,
    v_email,
    v_phone,
    v_shipping,
    v_billing,
    _items,
    _idempotency_key,
    _promotion_code
  );

  v_order_id := NULLIF(v_result->>'order_id', '')::uuid;
  v_reused := COALESCE((v_result->>'reused')::boolean, false);

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Checkout did not return an order id'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_reused THEN
    v_tax := public.recalculate_new_checkout_tax(v_order_id);
    v_result := v_result || v_tax;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) TO service_role;


CREATE OR REPLACE FUNCTION public.create_marketplace_order_locked(
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
  v_email text := lower(btrim(COALESCE(_customer_email, '')));
  v_phone text := NULLIF(btrim(COALESCE(_customer_phone, '')), '');
  v_shipping jsonb;
  v_billing jsonb;
  v_result jsonb;
  v_tax jsonb;
  v_order_id uuid;
  v_reused boolean := false;
BEGIN
  PERFORM public.assert_checkout_items_safe(_items);

  IF length(v_email) < 5
     OR length(v_email) > 320
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_email ~* '@auth\.1lv\.ca$' THEN
    RAISE EXCEPTION 'A valid customer email address is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Customer phone is too long'
      USING ERRCODE = '22023';
  END IF;

  v_shipping := public.normalize_canadian_checkout_address(
    _shipping_address,
    'Shipping'
  );

  v_billing := CASE
    WHEN _billing_address IS NULL THEN NULL
    ELSE public.normalize_canadian_checkout_address(
      _billing_address,
      'Billing'
    )
  END;

  v_result := public.create_marketplace_order_locked_unchecked(
    _customer_id,
    v_email,
    v_phone,
    v_shipping,
    v_billing,
    _items,
    _idempotency_key,
    _promotion_code
  );

  v_order_id := NULLIF(v_result->>'order_id', '')::uuid;
  v_reused := COALESCE((v_result->>'reused')::boolean, false);

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Checkout did not return an order id'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_reused THEN
    v_tax := public.recalculate_new_checkout_tax(v_order_id);
    v_result := v_result || v_tax;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order_locked(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_locked(
  uuid, text, text, jsonb, jsonb, jsonb, uuid, text
) TO service_role;


CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002154500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
