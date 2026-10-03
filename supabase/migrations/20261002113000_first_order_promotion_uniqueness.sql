-- Enforce first-order-only promotions across all first-order campaigns.
-- The promotion row lock protects one code, but different first-order promo
-- codes could otherwise be reserved concurrently by the same shopper.
-- Database uniqueness on normalized customer/email identities closes that race.

ALTER TABLE public.promotion_redemptions
  ADD COLUMN IF NOT EXISTS first_order_customer_key text,
  ADD COLUMN IF NOT EXISTS first_order_email_key text;

CREATE OR REPLACE FUNCTION public.enforce_first_order_promotion_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_first_order_only boolean := false;
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
  ELSE
    NEW.first_order_customer_key := NULL;
    NEW.first_order_email_key := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_first_order_promotion_identity()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS promotion_redemptions_first_order_identity
ON public.promotion_redemptions;

CREATE TRIGGER promotion_redemptions_first_order_identity
BEFORE INSERT OR UPDATE OF
  promotion_id,
  customer_id,
  customer_email,
  status
ON public.promotion_redemptions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_first_order_promotion_identity();

-- Backfill any current active first-order reservations/redemptions before
-- installing uniqueness. If production already contains conflicting active
-- first-order usage, this migration fails closed instead of silently choosing one.
UPDATE public.promotion_redemptions AS r
SET
  first_order_customer_key = CASE
    WHEN r.customer_id IS NULL THEN NULL
    ELSE 'customer:' || r.customer_id::text
  END,
  first_order_email_key =
    'email:' || lower(btrim(COALESCE(r.customer_email, '')))
FROM public.promotions AS p
WHERE p.id = r.promotion_id
  AND p.first_order_only = true
  AND r.status IN ('reserved', 'redeemed');

UPDATE public.promotion_redemptions
SET
  first_order_customer_key = NULL,
  first_order_email_key = NULL
WHERE status NOT IN ('reserved', 'redeemed');

CREATE UNIQUE INDEX IF NOT EXISTS
  promotion_redemptions_first_order_customer_uidx
ON public.promotion_redemptions(first_order_customer_key)
WHERE first_order_customer_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  promotion_redemptions_first_order_email_uidx
ON public.promotion_redemptions(first_order_email_key)
WHERE first_order_email_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002113000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
