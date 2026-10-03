-- Atomically claim TAKATAK outbox work so concurrent drain workers cannot
-- select and send the same pending event at the same time. Every processing
-- lease gets a unique claim token so a stale worker can never overwrite the
-- state written by the worker that reclaimed the event.
--
-- attempt_count is incremented when the lease is claimed, not after delivery.
-- This keeps crash/recovery loops bounded even when a worker dies after the
-- claim but before it can persist its final result.

ALTER TABLE public.takatak_outbox
  ADD COLUMN IF NOT EXISTS claim_token uuid;

CREATE OR REPLACE FUNCTION public.claim_takatak_outbox(
  _limit integer DEFAULT 25,
  _max_attempts integer DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  event_type text,
  aggregate_type text,
  aggregate_id text,
  payload jsonb,
  attempt_count integer,
  claim_token uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  v_max_attempts integer := LEAST(GREATEST(COALESCE(_max_attempts, 6), 1), 20);
BEGIN
  -- A worker may have disappeared after making the remote request. Release
  -- the local lease, but never let the abandoned token remain authoritative.
  -- Rows that have exhausted the configured budget become terminal failures.
  UPDATE public.takatak_outbox AS stale
  SET
    status = CASE
      WHEN stale.attempt_count >= v_max_attempts THEN 'failed'
      ELSE 'pending'
    END,
    claim_token = NULL,
    last_error = CASE
      WHEN stale.attempt_count >= v_max_attempts
        THEN 'Stale processing lease exhausted retry budget.'
      ELSE 'Recovered stale processing lease.'
    END,
    next_attempt_at = now(),
    updated_at = now()
  WHERE stale.status = 'processing'
    AND stale.updated_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
    FROM public.takatak_outbox AS o
    WHERE o.status = 'pending'
      AND o.attempt_count < v_max_attempts
      AND o.next_attempt_at <= now()
    ORDER BY o.created_at ASC, o.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.takatak_outbox AS o
    SET
      status = 'processing',
      attempt_count = o.attempt_count + 1,
      claim_token = gen_random_uuid(),
      last_error = NULL,
      updated_at = now()
    FROM candidates AS c
    WHERE o.id = c.id
      AND o.status = 'pending'
    RETURNING
      o.id,
      o.event_type,
      o.aggregate_type,
      o.aggregate_id,
      o.payload,
      o.attempt_count,
      o.claim_token
  )
  SELECT
    c.id,
    c.event_type,
    c.aggregate_type,
    c.aggregate_id,
    c.payload,
    c.attempt_count,
    c.claim_token
  FROM claimed AS c;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_takatak_outbox(integer, integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_takatak_outbox(integer, integer)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002180000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
