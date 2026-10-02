-- Recover Stripe webhook claims left in processing by a crashed worker.
-- Fresh processing claims stay exclusive; failed or stale processing claims
-- may be atomically reclaimed by a later Stripe delivery.

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  _id text,
  _type text,
  _payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  affected integer := 0;
BEGIN
  IF COALESCE(btrim(_id), '') = ''
     OR COALESCE(btrim(_type), '') = ''
     OR _payload IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.stripe_event_log(
    id,
    type,
    payload,
    status,
    processed_at,
    updated_at,
    last_error
  )
  VALUES(
    _id,
    _type,
    _payload,
    'processing',
    NULL,
    now(),
    NULL
  )
  ON CONFLICT(id) DO NOTHING;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 1 THEN
    RETURN true;
  END IF;

  UPDATE public.stripe_event_log
  SET
    type = _type,
    payload = _payload,
    status = 'processing',
    processed_at = NULL,
    updated_at = now(),
    last_error = NULL
  WHERE id = _id
    AND (
      status = 'failed'
      OR (
        status = 'processing'
        AND updated_at < now() - interval '10 minutes'
      )
    );

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_event(text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text,text,jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT '20261002064000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
  TO service_role;
