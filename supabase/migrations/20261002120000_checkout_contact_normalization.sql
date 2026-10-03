-- Normalize and validate checkout contact/address data inside PostgreSQL.
-- Browser validation is UX only; server-authoritative checkout must remain safe
-- when called directly by trusted services.

CREATE OR REPLACE FUNCTION public.normalize_canadian_checkout_address(
  _address jsonb,
  _label text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_label text := COALESCE(NULLIF(btrim(_label), ''), 'Checkout');
  v_first_name text;
  v_last_name text;
  v_street text;
  v_city text;
  v_province text;
  v_postal_compact text;
  v_country text;
BEGIN
  IF _address IS NULL
     OR jsonb_typeof(_address) <> 'object'
     OR octet_length(_address::text) > 4096 THEN
    RAISE EXCEPTION '% address is invalid', v_label
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(_address->'first_name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(_address->'last_name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(_address->'address') IS DISTINCT FROM 'string'
     OR jsonb_typeof(_address->'city') IS DISTINCT FROM 'string'
     OR jsonb_typeof(_address->'province') IS DISTINCT FROM 'string'
     OR jsonb_typeof(_address->'postal_code') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION '% address fields must be text', v_label
      USING ERRCODE = '22023';
  END IF;

  v_first_name := btrim(_address->>'first_name');
  v_last_name := btrim(_address->>'last_name');
  v_street := btrim(_address->>'address');
  v_city := btrim(_address->>'city');
  v_province := upper(btrim(_address->>'province'));
  v_postal_compact := regexp_replace(
    upper(btrim(_address->>'postal_code')),
    '[ -]',
    '',
    'g'
  );
  v_country := upper(btrim(COALESCE(_address->>'country', '')));

  IF length(v_first_name) NOT BETWEEN 1 AND 100
     OR length(v_last_name) NOT BETWEEN 1 AND 100
     OR length(v_street) NOT BETWEEN 1 AND 200
     OR length(v_city) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION '% address contains invalid field lengths', v_label
      USING ERRCODE = '22023';
  END IF;

  IF v_province NOT IN (
    'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'
  ) THEN
    RAISE EXCEPTION '% province is invalid', v_label
      USING ERRCODE = '22023';
  END IF;

  IF v_postal_compact !~
    '^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z][0-9][ABCEGHJ-NPRSTV-Z][0-9]$' THEN
    RAISE EXCEPTION '% postal code is invalid', v_label
      USING ERRCODE = '22023';
  END IF;

  IF v_country <> ''
     AND v_country NOT IN ('CA', 'CAN', 'CANADA') THEN
    RAISE EXCEPTION '1LV checkout supports Canadian addresses only'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'first_name', v_first_name,
    'last_name', v_last_name,
    'address', v_street,
    'city', v_city,
    'province', v_province,
    'postal_code',
      substring(v_postal_compact from 1 for 3)
      || ' '
      || substring(v_postal_compact from 4 for 3),
    'country', 'Canada'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_canadian_checkout_address(jsonb, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_canadian_checkout_address(jsonb, text)
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

  RETURN public.create_marketplace_order_unchecked(
    _customer_id,
    v_email,
    v_phone,
    v_shipping,
    v_billing,
    _items,
    _idempotency_key,
    _promotion_code
  );
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

  RETURN public.create_marketplace_order_locked_unchecked(
    _customer_id,
    v_email,
    v_phone,
    v_shipping,
    v_billing,
    _items,
    _idempotency_key,
    _promotion_code
  );
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
  SELECT '20261002120000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
