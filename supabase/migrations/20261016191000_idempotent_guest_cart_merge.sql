-- Dedicated 1LV idempotent guest-cart merge.
-- No direct client table grants. Keep the legacy RPC for service_role only.
-- Schema DDL is checked in CI but MUST NOT be applied to an unrelated database.

CREATE TABLE public.customer_cart_merge_attempts (
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merge_key uuid NOT NULL,
  request_items jsonb NOT NULL CHECK (jsonb_typeof(request_items) = 'array'),
  outcome jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, merge_key)
);

ALTER TABLE public.customer_cart_merge_attempts ENABLE ROW LEVEL SECURITY;

-- Defence in depth: role ownership is checked even if a future grant exposes
-- the journal. No raw browser access is currently granted.
CREATE POLICY "Authorized owner merge journal"
ON public.customer_cart_merge_attempts
FOR ALL TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  AND (SELECT public.is_takatak_authorized_session())
)
WITH CHECK (
  customer_id = (SELECT auth.uid())
  AND (SELECT public.is_takatak_authorized_session())
);

REVOKE ALL ON TABLE public.customer_cart_merge_attempts
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.customer_cart_merge_attempts TO service_role;

-- The new two-argument RPC serializes every retry on account and merge key,
-- compares the exact input and persists the outcome in the SAME DB transaction
-- as the existing merging RPC.
CREATE OR REPLACE FUNCTION public.merge_guest_cart(
  _items jsonb,
  _merge_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer uuid;
  v_before jsonb;
  v_outcome jsonb;
  v_line jsonb;
BEGIN
  v_customer := public.require_my_cart_session();
  IF _merge_key IS NULL OR _items IS NULL OR
     jsonb_typeof(_items) <> 'array' OR
     jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Invalid guest cart merge request'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_customer::text || ':' || _merge_key::text, 54119)
  );

  SELECT request_items, outcome INTO v_before, v_outcome
  FROM public.customer_cart_merge_attempts
  WHERE customer_id = v_customer AND merge_key = _merge_key;

  IF FOUND THEN
    IF v_before IS DISTINCT FROM _items THEN
      RAISE EXCEPTION 'Guest cart merge key reused with different items'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_outcome;
  END IF;

  -- Validate every line up front: the prior RPC intentionally skips
  -- ineligible products, but a successful response must never silently
  -- erase unmerged guest intent on the client.
  FOR v_line IN SELECT value FROM jsonb_array_elements(_items) LOOP
    PERFORM public.resolve_cart_target_quantity(
      (v_line->>'product_id')::uuid,
      NULLIF(v_line->>'variant_id', '')::uuid,
      (v_line->>'quantity')::integer
    );
  END LOOP;

  v_outcome := public.merge_guest_cart(_items);

  INSERT INTO public.customer_cart_merge_attempts (
    customer_id, merge_key, request_items, outcome
  ) VALUES (v_customer, _merge_key, _items, v_outcome);

  RETURN v_outcome;
END;
$$;

-- Prevent legacy non-idempotent RPC from remaining browser-callable.
REVOKE ALL ON FUNCTION public.merge_guest_cart(jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_guest_cart(jsonb)
TO service_role;

REVOKE ALL ON FUNCTION public.merge_guest_cart(jsonb, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_guest_cart(jsonb, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261016191000';
$$;
REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
