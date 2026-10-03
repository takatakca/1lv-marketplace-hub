-- Dedicated item/SKU-level RMA engine for 1LV.
-- Returns are commerce state owned by 1LV. Refund execution stays in the
-- existing Stripe/refund accounting path; this migration only reserves and
-- links an approved return refund into that established authority.

CREATE TYPE public.return_status AS ENUM (
  'requested',
  'approved',
  'label_issued',
  'in_transit',
  'received',
  'inspecting',
  'refund_approved',
  'refunded',
  'rejected',
  'cancelled',
  'closed'
);

CREATE TYPE public.return_reason AS ENUM (
  'damaged',
  'defective',
  'wrong_item',
  'not_as_described',
  'missing_parts',
  'size_fit',
  'unwanted',
  'other'
);

CREATE TABLE public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  status public.return_status NOT NULL DEFAULT 'requested',
  reason public.return_reason NOT NULL,
  description text,
  return_carrier text,
  return_tracking_number text,
  return_label_url text,
  inspection_note text,
  refund_record_id uuid UNIQUE REFERENCES public.refund_records(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  inspected_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_requests_description_length CHECK (
    description IS NULL OR length(description) <= 4000
  ),
  CONSTRAINT return_requests_carrier_length CHECK (
    return_carrier IS NULL OR length(return_carrier) <= 120
  ),
  CONSTRAINT return_requests_tracking_length CHECK (
    return_tracking_number IS NULL OR length(return_tracking_number) <= 120
  ),
  CONSTRAINT return_requests_label_length CHECK (
    return_label_url IS NULL OR length(return_label_url) <= 2048
  ),
  CONSTRAINT return_requests_inspection_length CHECK (
    inspection_note IS NULL OR length(inspection_note) <= 4000
  )
);

CREATE TABLE public.return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL
    REFERENCES public.return_requests(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL
    REFERENCES public.order_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_items_request_item_unique
    UNIQUE (return_request_id, order_item_id)
);

CREATE TABLE public.return_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL
    REFERENCES public.return_requests(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_role text NOT NULL,
  from_status public.return_status,
  to_status public.return_status NOT NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_events_actor_role CHECK (
    actor_role IN ('customer', 'vendor', 'admin', 'system')
  ),
  CONSTRAINT return_events_note_length CHECK (
    note IS NULL OR length(note) <= 4000
  ),
  CONSTRAINT return_events_metadata_size CHECK (
    octet_length(metadata::text) <= 16384
  )
);

CREATE INDEX return_requests_customer_idx
ON public.return_requests (customer_id, created_at DESC);

CREATE INDEX return_requests_vendor_idx
ON public.return_requests (vendor_id, created_at DESC);

CREATE INDEX return_requests_vendor_order_idx
ON public.return_requests (vendor_order_id, created_at DESC);

CREATE INDEX return_requests_status_idx
ON public.return_requests (status, created_at);

CREATE INDEX return_items_order_item_idx
ON public.return_items (order_item_id);

CREATE INDEX return_events_request_idx
ON public.return_events (return_request_id, created_at, id);

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.return_requests
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.return_items
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.return_events
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

REVOKE ALL ON TABLE public.return_requests
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.return_items
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.return_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.return_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.return_items TO service_role;
GRANT SELECT, INSERT
ON TABLE public.return_events TO service_role;

CREATE OR REPLACE FUNCTION public.can_access_return_request(
  _return_request_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.is_takatak_authorized_session()
    AND EXISTS (
      SELECT 1
      FROM public.return_requests AS rr
      JOIN public.vendors AS v ON v.id = rr.vendor_id
      WHERE rr.id = _return_request_id
        AND (
          rr.customer_id = auth.uid()
          OR v.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_return_request(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_return_request(uuid)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_return_request(
  _order_id uuid,
  _reason public.return_reason,
  _description text,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_vendor_id uuid;
  v_vendor_order_id uuid;
  v_item record;
  v_order_item public.order_items%ROWTYPE;
  v_delivered_at timestamptz;
  v_prior_quantity integer;
  v_request_id uuid;
  v_description text := NULLIF(btrim(COALESCE(_description, '')), '');
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  IF _order_id IS NULL OR _reason IS NULL
     OR _items IS NULL OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 50 THEN
    RAISE EXCEPTION 'A return requires an order, reason and 1 to 50 items'
      USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND length(v_description) > 4000 THEN
    RAISE EXCEPTION 'Return description is too long'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_items) AS entry
    WHERE COALESCE(entry->>'order_item_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(entry->>'quantity', '') !~ '^[1-9][0-9]?$'
  ) THEN
    RAISE EXCEPTION 'Each return item must have a valid order item and quantity'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.customer_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Return order not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  IF v_order.payment_status NOT IN (
    'paid'::public.payment_status,
    'partially_refunded'::public.payment_status
  ) THEN
    RAISE EXCEPTION 'Only retained paid orders are return eligible'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT
      (entry->>'order_item_id')::uuid AS order_item_id,
      sum((entry->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(_items) AS entry
    GROUP BY (entry->>'order_item_id')::uuid
    ORDER BY (entry->>'order_item_id')::uuid
  LOOP
    SELECT *
    INTO v_order_item
    FROM public.order_items
    WHERE id = v_item.order_item_id
      AND order_id = _order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Return item does not belong to this order'
        USING ERRCODE = '22023';
    END IF;

    IF v_order_item.status <> 'delivered'::public.fulfillment_status THEN
      RAISE EXCEPTION 'Only delivered items can be returned'
        USING ERRCODE = '22023';
    END IF;

    IF v_item.quantity < 1 OR v_item.quantity > v_order_item.quantity THEN
      RAISE EXCEPTION 'Return quantity exceeds purchased quantity'
        USING ERRCODE = '22023';
    END IF;

    SELECT vo.id, vo.delivered_at
    INTO v_vendor_order_id, v_delivered_at
    FROM public.vendor_orders AS vo
    WHERE vo.order_id = _order_id
      AND vo.vendor_id = v_order_item.vendor_id
    FOR UPDATE;

    IF v_vendor_order_id IS NULL OR v_delivered_at IS NULL THEN
      RAISE EXCEPTION 'Return requires confirmed delivery'
        USING ERRCODE = '22023';
    END IF;

    IF now() > v_delivered_at + interval '30 days' THEN
      RAISE EXCEPTION 'The standard 30-day return window has expired'
        USING ERRCODE = '22023';
    END IF;

    IF v_vendor_id IS NULL THEN
      v_vendor_id := v_order_item.vendor_id;
    ELSIF v_vendor_id <> v_order_item.vendor_id THEN
      RAISE EXCEPTION 'A return request may contain items from one seller only'
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(sum(ri.quantity), 0)::integer
    INTO v_prior_quantity
    FROM public.return_items AS ri
    JOIN public.return_requests AS rr
      ON rr.id = ri.return_request_id
    WHERE ri.order_item_id = v_order_item.id
      AND rr.status NOT IN (
        'rejected'::public.return_status,
        'cancelled'::public.return_status
      );

    IF v_prior_quantity + v_item.quantity > v_order_item.quantity THEN
      RAISE EXCEPTION 'Previously returned quantity plus this request exceeds purchase quantity'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT vo.id
  INTO v_vendor_order_id
  FROM public.vendor_orders AS vo
  WHERE vo.order_id = _order_id
    AND vo.vendor_id = v_vendor_id;

  INSERT INTO public.return_requests (
    order_id,
    vendor_order_id,
    customer_id,
    vendor_id,
    reason,
    description
  )
  VALUES (
    _order_id,
    v_vendor_order_id,
    v_user_id,
    v_vendor_id,
    _reason,
    v_description
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.return_items (
    return_request_id,
    order_item_id,
    quantity
  )
  SELECT
    v_request_id,
    (entry->>'order_item_id')::uuid,
    sum((entry->>'quantity')::integer)::integer
  FROM jsonb_array_elements(_items) AS entry
  GROUP BY (entry->>'order_item_id')::uuid;

  INSERT INTO public.return_events (
    return_request_id,
    actor_user_id,
    actor_role,
    from_status,
    to_status,
    note
  )
  VALUES (
    v_request_id,
    v_user_id,
    'customer',
    NULL,
    'requested'::public.return_status,
    v_description
  );

  RETURN jsonb_build_object(
    'ok', true,
    'return_request_id', v_request_id,
    'status', 'requested',
    'return_window_days', 30
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_return_request(
  uuid, public.return_reason, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_return_request(
  uuid, public.return_reason, text, jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_return_request(
  _return_request_id uuid,
  _note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_return public.return_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK customer session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_return
  FROM public.return_requests
  WHERE id = _return_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_return.customer_id <> v_user_id THEN
    RAISE EXCEPTION 'Return request not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  IF v_return.status NOT IN (
    'requested'::public.return_status,
    'approved'::public.return_status
  ) THEN
    RAISE EXCEPTION 'Return can no longer be cancelled by the customer'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.return_requests
  SET
    status = 'cancelled'::public.return_status,
    closed_at = now(),
    updated_at = now()
  WHERE id = v_return.id;

  INSERT INTO public.return_events (
    return_request_id,
    actor_user_id,
    actor_role,
    from_status,
    to_status,
    note
  )
  VALUES (
    v_return.id,
    v_user_id,
    'customer',
    v_return.status,
    'cancelled'::public.return_status,
    NULLIF(btrim(COALESCE(_note, '')), '')
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_return_request(uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_return_request(uuid, text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_return_request(
  _return_request_id uuid,
  _next_status public.return_status,
  _note text DEFAULT NULL,
  _carrier text DEFAULT NULL,
  _tracking_number text DEFAULT NULL,
  _label_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_return public.return_requests%ROWTYPE;
  v_vendor_owner uuid;
  v_is_admin boolean := false;
  v_actor_role text;
  v_note text := NULLIF(btrim(COALESCE(_note, '')), '');
  v_carrier text := NULLIF(btrim(COALESCE(_carrier, '')), '');
  v_tracking text := NULLIF(btrim(COALESCE(_tracking_number, '')), '');
  v_label text := NULLIF(btrim(COALESCE(_label_url, '')), '');
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK operator session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_return
  FROM public.return_requests
  WHERE id = _return_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return request not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT user_id
  INTO v_vendor_owner
  FROM public.vendors
  WHERE id = v_return.vendor_id;

  v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);

  IF v_user_id = v_vendor_owner THEN
    v_actor_role := 'vendor';
  ELSIF v_is_admin THEN
    v_actor_role := 'admin';
  ELSE
    RAISE EXCEPTION 'Vendor or marketplace admin required'
      USING ERRCODE = '42501';
  END IF;

  IF _next_status IS NULL OR _next_status = v_return.status THEN
    RAISE EXCEPTION 'A new return status is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (v_return.status = 'requested'::public.return_status
      AND _next_status IN (
        'approved'::public.return_status,
        'rejected'::public.return_status
      ))
    OR
    (v_return.status = 'approved'::public.return_status
      AND _next_status IN (
        'label_issued'::public.return_status,
        'in_transit'::public.return_status
      ))
    OR
    (v_return.status = 'label_issued'::public.return_status
      AND _next_status = 'in_transit'::public.return_status)
    OR
    (v_return.status = 'in_transit'::public.return_status
      AND _next_status = 'received'::public.return_status)
    OR
    (v_return.status = 'received'::public.return_status
      AND _next_status = 'inspecting'::public.return_status)
    OR
    (v_return.status = 'inspecting'::public.return_status
      AND _next_status IN (
        'rejected'::public.return_status,
        'closed'::public.return_status
      ))
  ) THEN
    RAISE EXCEPTION 'Invalid return transition: % -> %',
      v_return.status::text,
      _next_status::text
      USING ERRCODE = '22023';
  END IF;

  IF v_note IS NOT NULL AND length(v_note) > 4000 THEN
    RAISE EXCEPTION 'Return note is too long'
      USING ERRCODE = '22023';
  END IF;

  IF v_carrier IS NOT NULL AND length(v_carrier) > 120 THEN
    RAISE EXCEPTION 'Return carrier is too long'
      USING ERRCODE = '22023';
  END IF;

  IF v_tracking IS NOT NULL AND length(v_tracking) > 120 THEN
    RAISE EXCEPTION 'Return tracking number is too long'
      USING ERRCODE = '22023';
  END IF;

  IF v_label IS NOT NULL AND length(v_label) > 2048 THEN
    RAISE EXCEPTION 'Return label URL is too long'
      USING ERRCODE = '22023';
  END IF;

  IF _next_status = 'label_issued'::public.return_status
     AND v_label IS NULL THEN
    RAISE EXCEPTION 'A return label is required before label-issued status'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.return_requests
  SET
    status = _next_status,
    return_carrier = COALESCE(v_carrier, return_carrier),
    return_tracking_number = COALESCE(v_tracking, return_tracking_number),
    return_label_url = COALESCE(v_label, return_label_url),
    inspection_note = CASE
      WHEN _next_status IN (
        'rejected'::public.return_status,
        'closed'::public.return_status
      ) THEN COALESCE(v_note, inspection_note)
      ELSE inspection_note
    END,
    approved_at = CASE
      WHEN _next_status = 'approved'::public.return_status
        THEN COALESCE(approved_at, now())
      ELSE approved_at
    END,
    shipped_at = CASE
      WHEN _next_status = 'in_transit'::public.return_status
        THEN COALESCE(shipped_at, now())
      ELSE shipped_at
    END,
    received_at = CASE
      WHEN _next_status = 'received'::public.return_status
        THEN COALESCE(received_at, now())
      ELSE received_at
    END,
    inspected_at = CASE
      WHEN _next_status IN (
        'rejected'::public.return_status,
        'closed'::public.return_status
      ) THEN COALESCE(inspected_at, now())
      ELSE inspected_at
    END,
    closed_at = CASE
      WHEN _next_status IN (
        'rejected'::public.return_status,
        'closed'::public.return_status
      ) THEN COALESCE(closed_at, now())
      ELSE closed_at
    END,
    updated_at = now()
  WHERE id = v_return.id;

  INSERT INTO public.return_events (
    return_request_id,
    actor_user_id,
    actor_role,
    from_status,
    to_status,
    note,
    metadata
  )
  VALUES (
    v_return.id,
    v_user_id,
    v_actor_role,
    v_return.status,
    _next_status,
    v_note,
    jsonb_strip_nulls(
      jsonb_build_object(
        'carrier', v_carrier,
        'tracking_number', v_tracking,
        'label_url', v_label
      )
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'return_request_id', v_return.id,
    'status', _next_status::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_return_request(
  uuid, public.return_status, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_return_request(
  uuid, public.return_status, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_return_refund(
  _return_request_id uuid,
  _amount numeric,
  _actor uuid,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_return public.return_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_vendor_order public.vendor_orders%ROWTYPE;
  v_max_merchandise numeric(12,2);
  v_reserved_order numeric(12,2);
  v_reserved_vendor numeric(12,2);
  v_amount numeric(12,2);
  v_refund_id uuid;
BEGIN
  IF _return_request_id IS NULL OR _actor IS NULL OR _amount IS NULL THEN
    RAISE EXCEPTION 'Return, actor and refund amount are required'
      USING ERRCODE = '22023';
  END IF;

  v_amount := round(_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Return refund amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_return
  FROM public.return_requests
  WHERE id = _return_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return request not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_return.status NOT IN (
    'received'::public.return_status,
    'inspecting'::public.return_status
  ) OR v_return.refund_record_id IS NOT NULL THEN
    RAISE EXCEPTION 'Return is not eligible for refund reservation'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_role(_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Marketplace admin required to approve return refund'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_return.order_id
  FOR UPDATE;

  SELECT *
  INTO v_vendor_order
  FROM public.vendor_orders
  WHERE id = v_return.vendor_order_id
  FOR UPDATE;

  IF v_order.payment_status NOT IN (
    'paid'::public.payment_status,
    'partially_refunded'::public.payment_status
  ) THEN
    RAISE EXCEPTION 'Return order is not refundable'
      USING ERRCODE = '22023';
  END IF;

  SELECT round(sum(oi.unit_price * ri.quantity)::numeric, 2)
  INTO v_max_merchandise
  FROM public.return_items AS ri
  JOIN public.order_items AS oi
    ON oi.id = ri.order_item_id
  WHERE ri.return_request_id = v_return.id;

  IF v_amount > COALESCE(v_max_merchandise, 0) THEN
    RAISE EXCEPTION 'Return refund exceeds returned merchandise value'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(amount), 0)
  INTO v_reserved_order
  FROM public.refund_records
  WHERE order_id = v_return.order_id
    AND status IN (
      'approved'::public.refund_status,
      'processing'::public.refund_status,
      'refunded'::public.refund_status
    );

  SELECT COALESCE(sum(amount), 0)
  INTO v_reserved_vendor
  FROM public.refund_records
  WHERE vendor_order_id = v_return.vendor_order_id
    AND status IN (
      'approved'::public.refund_status,
      'processing'::public.refund_status,
      'refunded'::public.refund_status
    );

  IF v_amount > round(GREATEST(v_order.total - v_reserved_order, 0), 2)
     OR v_amount > round(
       GREATEST(v_vendor_order.subtotal - v_reserved_vendor, 0),
       2
     ) THEN
    RAISE EXCEPTION 'Return refund exceeds remaining refundable amount'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.refund_records (
    order_id,
    vendor_order_id,
    amount,
    currency,
    reason,
    status,
    created_by,
    approved_by,
    approved_at
  )
  VALUES (
    v_return.order_id,
    v_return.vendor_order_id,
    v_amount,
    upper(COALESCE(v_order.currency, 'CAD')),
    COALESCE(
      NULLIF(btrim(COALESCE(_note, '')), ''),
      'Approved item return'
    ),
    'approved'::public.refund_status,
    _actor,
    _actor,
    now()
  )
  RETURNING id INTO v_refund_id;

  UPDATE public.return_requests
  SET
    status = 'refund_approved'::public.return_status,
    refund_record_id = v_refund_id,
    inspected_at = COALESCE(inspected_at, now()),
    inspection_note = COALESCE(
      NULLIF(btrim(COALESCE(_note, '')), ''),
      inspection_note
    ),
    updated_at = now()
  WHERE id = v_return.id;

  INSERT INTO public.return_events (
    return_request_id,
    actor_user_id,
    actor_role,
    from_status,
    to_status,
    note,
    metadata
  )
  VALUES (
    v_return.id,
    _actor,
    'admin',
    v_return.status,
    'refund_approved'::public.return_status,
    NULLIF(btrim(COALESCE(_note, '')), ''),
    jsonb_build_object(
      'refund_record_id', v_refund_id,
      'amount', v_amount
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'return_request_id', v_return.id,
    'refund_record_id', v_refund_id,
    'amount', v_amount,
    'status', 'refund_approved'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_return_refund(
  uuid, numeric, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_return_refund(
  uuid, numeric, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_return_refund_status()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_return public.return_requests%ROWTYPE;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_return
  FROM public.return_requests
  WHERE refund_record_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'refunded'::public.refund_status
     AND v_return.status = 'refund_approved'::public.return_status THEN
    UPDATE public.return_requests
    SET
      status = 'refunded'::public.return_status,
      closed_at = COALESCE(closed_at, now()),
      updated_at = now()
    WHERE id = v_return.id;

    INSERT INTO public.return_events (
      return_request_id,
      actor_user_id,
      actor_role,
      from_status,
      to_status,
      note,
      metadata
    )
    VALUES (
      v_return.id,
      NULL,
      'system',
      v_return.status,
      'refunded'::public.return_status,
      'Stripe refund finalized',
      jsonb_build_object(
        'refund_record_id', NEW.id,
        'stripe_refund_id', NEW.stripe_refund_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_return_refund_status()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_return_refund_status()
TO service_role, supabase_admin;

CREATE TRIGGER refund_records_sync_return_status
AFTER UPDATE OF status ON public.refund_records
FOR EACH ROW
EXECUTE FUNCTION public.sync_return_refund_status();

CREATE OR REPLACE FUNCTION public.get_return_request(
  _return_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.can_access_return_request(_return_request_id) THEN
    RAISE EXCEPTION 'Return request not found or access denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', rr.id,
    'order_id', rr.order_id,
    'vendor_order_id', rr.vendor_order_id,
    'customer_id', rr.customer_id,
    'vendor_id', rr.vendor_id,
    'status', rr.status::text,
    'reason', rr.reason::text,
    'description', rr.description,
    'return_carrier', rr.return_carrier,
    'return_tracking_number', rr.return_tracking_number,
    'return_label_url', rr.return_label_url,
    'inspection_note', rr.inspection_note,
    'refund_record_id', rr.refund_record_id,
    'requested_at', rr.requested_at,
    'approved_at', rr.approved_at,
    'shipped_at', rr.shipped_at,
    'received_at', rr.received_at,
    'inspected_at', rr.inspected_at,
    'closed_at', rr.closed_at,
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ri.id,
          'order_item_id', ri.order_item_id,
          'quantity', ri.quantity,
          'title', oi.title,
          'unit_price', oi.unit_price,
          'variant_id', oi.variant_id,
          'variant_sku', oi.variant_sku,
          'variant_options', oi.variant_options
        )
        ORDER BY ri.created_at, ri.id
      )
      FROM public.return_items AS ri
      JOIN public.order_items AS oi
        ON oi.id = ri.order_item_id
      WHERE ri.return_request_id = rr.id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', re.id,
          'actor_role', re.actor_role,
          'from_status', re.from_status::text,
          'to_status', re.to_status::text,
          'note', re.note,
          'metadata', re.metadata,
          'created_at', re.created_at
        )
        ORDER BY re.created_at, re.id
      )
      FROM public.return_events AS re
      WHERE re.return_request_id = rr.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.return_requests AS rr
  WHERE rr.id = _return_request_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_return_request(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_return_request(uuid)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_my_return_requests(
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  vendor_order_id uuid,
  vendor_id uuid,
  status public.return_status,
  reason public.return_reason,
  requested_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    rr.id,
    rr.order_id,
    rr.vendor_order_id,
    rr.vendor_id,
    rr.status,
    rr.reason,
    rr.requested_at,
    rr.updated_at
  FROM public.return_requests AS rr
  WHERE auth.uid() IS NOT NULL
    AND public.is_takatak_authorized_session()
    AND rr.customer_id = auth.uid()
  ORDER BY rr.created_at DESC, rr.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 300);
$$;

REVOKE ALL ON FUNCTION public.list_my_return_requests(integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_return_requests(integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.list_vendor_return_requests(
  _vendor_id uuid,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  vendor_order_id uuid,
  customer_id uuid,
  status public.return_status,
  reason public.return_reason,
  requested_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL
     OR NOT public.is_takatak_authorized_session()
     OR NOT EXISTS (
       SELECT 1
       FROM public.vendors AS v
       WHERE v.id = _vendor_id
         AND (
           v.user_id = v_user_id
           OR public.has_role(v_user_id, 'admin'::public.app_role)
         )
     ) THEN
    RAISE EXCEPTION 'Vendor return access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    rr.id,
    rr.order_id,
    rr.vendor_order_id,
    rr.customer_id,
    rr.status,
    rr.reason,
    rr.requested_at,
    rr.updated_at
  FROM public.return_requests AS rr
  WHERE rr.vendor_id = _vendor_id
  ORDER BY rr.created_at DESC, rr.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 300);
END;
$$;

REVOKE ALL ON FUNCTION public.list_vendor_return_requests(uuid, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_vendor_return_requests(uuid, integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003033000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
