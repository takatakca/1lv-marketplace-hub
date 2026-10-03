-- Complete a successful TAKATAK delivery in one token-fenced transaction.
-- A stale worker must never be able to write profile/vendor/order links after
-- another worker reclaimed the outbox event.

CREATE OR REPLACE FUNCTION public.complete_takatak_outbox_delivery(
  _id uuid,
  _claim_token uuid,
  _remote_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.takatak_outbox%ROWTYPE;
  v_remote_id text := NULLIF(btrim(COALESCE(_remote_id, '')), '');
  v_aggregate_uuid uuid;
  v_current text;
BEGIN
  IF _id IS NULL OR _claim_token IS NULL THEN
    RETURN false;
  END IF;

  SELECT o.*
  INTO v_event
  FROM public.takatak_outbox AS o
  WHERE o.id = _id
    AND o.status = 'processing'
    AND o.claim_token = _claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_remote_id IS NOT NULL
     AND v_event.aggregate_type IN ('customer', 'merchant', 'order')
     AND NOT (
       v_event.aggregate_type = 'customer'
       AND v_event.aggregate_id LIKE 'guest:%'
     ) THEN
    IF v_event.aggregate_id !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'TAKATAK aggregate id is not a valid local UUID'
        USING ERRCODE = '22023';
    END IF;

    v_aggregate_uuid := v_event.aggregate_id::uuid;

    IF v_event.aggregate_type = 'customer' THEN
      SELECT p.takatak_person_id
      INTO v_current
      FROM public.profiles AS p
      WHERE p.id = v_aggregate_uuid
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Could not verify the local TAKATAK identity link'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_current IS NOT NULL AND v_current <> v_remote_id THEN
        RAISE EXCEPTION
          'TAKATAK identity conflict: local profile is linked to another master identity'
          USING ERRCODE = '23505';
      END IF;

      IF v_current IS NULL THEN
        UPDATE public.profiles
        SET takatak_person_id = v_remote_id
        WHERE id = v_aggregate_uuid;
      END IF;

    ELSIF v_event.aggregate_type = 'merchant' THEN
      SELECT v.takatak_merchant_id
      INTO v_current
      FROM public.vendors AS v
      WHERE v.id = v_aggregate_uuid
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Could not verify the local TAKATAK merchant link'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_current IS NOT NULL AND v_current <> v_remote_id THEN
        RAISE EXCEPTION
          'TAKATAK merchant conflict: local vendor is linked to another master merchant'
          USING ERRCODE = '23505';
      END IF;

      UPDATE public.vendors
      SET
        takatak_merchant_id = COALESCE(takatak_merchant_id, v_remote_id),
        takatak_sync_status = 'synced',
        takatak_last_synced_at = now()
      WHERE id = v_aggregate_uuid;

    ELSIF v_event.aggregate_type = 'order' THEN
      SELECT o.takatak_order_event_id
      INTO v_current
      FROM public.orders AS o
      WHERE o.id = v_aggregate_uuid
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Could not verify the local TAKATAK order-event link'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_current IS NOT NULL AND v_current <> v_remote_id THEN
        RAISE EXCEPTION
          'TAKATAK order-event conflict: local order is linked to another master event'
          USING ERRCODE = '23505';
      END IF;

      IF v_current IS NULL THEN
        UPDATE public.orders
        SET takatak_order_event_id = v_remote_id
        WHERE id = v_aggregate_uuid;
      END IF;
    END IF;
  END IF;

  UPDATE public.takatak_outbox
  SET
    status = 'delivered',
    claim_token = NULL,
    last_error = NULL,
    remote_id = v_remote_id,
    delivered_at = now(),
    updated_at = now()
  WHERE id = _id
    AND status = 'processing'
    AND claim_token = _claim_token;

  IF NOT FOUND THEN
    -- The row is locked above, so this should only be defensive.
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_takatak_outbox_delivery(
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_takatak_outbox_delivery(
  uuid,
  uuid,
  text
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002191500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
