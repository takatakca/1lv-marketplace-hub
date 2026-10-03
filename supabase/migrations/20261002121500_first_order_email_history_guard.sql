-- Close the guest-to-account loophole for first-order promotions.
-- A prior paid order must disqualify the shopper when either the master/local
-- customer id matches OR the normalized checkout email matches.

CREATE OR REPLACE FUNCTION public.enforce_first_order_promotion_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_first_order_only boolean := false;
  v_has_prior_paid_order boolean := false;
BEGIN
  SELECT p.first_order_only
  INTO v_first_order_only
  FROM public.promotions AS p
  WHERE p.id = NEW.promotion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion not found for redemption'
      USING ERRCODE = '23503';
  END IF;

  IF v_first_order_only
     AND NEW.status IN ('reserved', 'redeemed') THEN
    NEW.first_order_customer_key := CASE
      WHEN NEW.customer_id IS NULL THEN NULL
      ELSE 'customer:' || NEW.customer_id::text
    END;
    NEW.first_order_email_key :=
      'email:' || lower(btrim(COALESCE(NEW.customer_email, '')));

    IF NEW.first_order_email_key = 'email:' THEN
      RAISE EXCEPTION 'First-order promotion requires a customer email'
        USING ERRCODE = '22023';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.orders AS o
      WHERE o.id <> NEW.order_id
        AND o.payment_status::text IN ('paid', 'partially_refunded')
        AND (
          (
            NEW.customer_id IS NOT NULL
            AND o.customer_id = NEW.customer_id
          )
          OR lower(btrim(COALESCE(o.customer_email, ''))) =
             lower(btrim(NEW.customer_email))
        )
    )
    INTO v_has_prior_paid_order;

    IF v_has_prior_paid_order THEN
      RAISE EXCEPTION 'Promotion is available on the first paid order only'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    NEW.first_order_customer_key := NULL;
    NEW.first_order_email_key := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_first_order_promotion_identity()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002121500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
