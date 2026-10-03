-- Atomically reserve dispute refunds before any external Stripe call.
-- This closes the race where concurrent approvals could both observe the same
-- remaining refundable amount and collectively over-reserve an order.

CREATE UNIQUE INDEX IF NOT EXISTS disputes_one_open_per_vendor_order
ON public.disputes(vendor_order_id)
WHERE vendor_order_id IS NOT NULL
  AND status IN (
    'open'::public.dispute_status,
    'under_review'::public.dispute_status,
    'waiting_customer'::public.dispute_status,
    'waiting_vendor'::public.dispute_status
  );


CREATE OR REPLACE FUNCTION public.reserve_dispute_refund(
  _dispute_id uuid,
  _amount numeric,
  _reason text,
  _actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  d public.disputes%ROWTYPE;
  o public.orders%ROWTYPE;
  vo public.vendor_orders%ROWTYPE;
  requested_amount numeric;
  reserved_order numeric := 0;
  reserved_split numeric := 0;
  remaining_order numeric := 0;
  remaining_split numeric := 0;
  refund_id uuid;
BEGIN
  IF _dispute_id IS NULL OR _actor IS NULL OR _amount IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  requested_amount := round(_amount, 2);
  IF requested_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  SELECT *
  INTO d
  FROM public.disputes
  WHERE id = _dispute_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'dispute_not_found');
  END IF;

  IF d.status NOT IN (
    'open'::public.dispute_status,
    'under_review'::public.dispute_status,
    'waiting_customer'::public.dispute_status,
    'waiting_vendor'::public.dispute_status
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_dispute_state',
      'status', d.status::text
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.refund_records r
    WHERE r.dispute_id = d.id
      AND r.status IN (
        'approved'::public.refund_status,
        'processing'::public.refund_status,
        'refunded'::public.refund_status
      )
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'refund_already_reserved'
    );
  END IF;

  SELECT *
  INTO o
  FROM public.orders
  WHERE id = d.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found');
  END IF;

  IF o.payment_status NOT IN (
    'paid'::public.payment_status,
    'partially_refunded'::public.payment_status
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'order_not_refundable'
    );
  END IF;

  SELECT COALESCE(sum(r.amount), 0)
  INTO reserved_order
  FROM public.refund_records r
  WHERE r.order_id = o.id
    AND r.status IN (
      'approved'::public.refund_status,
      'processing'::public.refund_status,
      'refunded'::public.refund_status
    );

  remaining_order := round(GREATEST(o.total - reserved_order, 0), 2);

  IF requested_amount > remaining_order THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'order_refund_limit',
      'remaining', remaining_order
    );
  END IF;

  IF d.vendor_order_id IS NOT NULL THEN
    SELECT *
    INTO vo
    FROM public.vendor_orders
    WHERE id = d.vendor_order_id
    FOR UPDATE;

    IF NOT FOUND
       OR vo.order_id <> d.order_id
       OR vo.vendor_id <> d.vendor_id THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'vendor_split_mismatch'
      );
    END IF;

    SELECT COALESCE(sum(r.amount), 0)
    INTO reserved_split
    FROM public.refund_records r
    WHERE r.vendor_order_id = vo.id
      AND r.status IN (
        'approved'::public.refund_status,
        'processing'::public.refund_status,
        'refunded'::public.refund_status
      );

    remaining_split := round(
      GREATEST(COALESCE(vo.subtotal, 0) - reserved_split, 0),
      2
    );

    IF requested_amount > remaining_split THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'vendor_refund_limit',
        'remaining', remaining_split
      );
    END IF;
  END IF;

  INSERT INTO public.refund_records(
    order_id,
    vendor_order_id,
    dispute_id,
    amount,
    currency,
    reason,
    status,
    created_by,
    approved_by,
    approved_at
  )
  VALUES(
    d.order_id,
    d.vendor_order_id,
    d.id,
    requested_amount,
    upper(COALESCE(o.currency, 'CAD')),
    NULLIF(btrim(COALESCE(_reason, '')), ''),
    'approved'::public.refund_status,
    _actor,
    _actor,
    now()
  )
  RETURNING id INTO refund_id;

  UPDATE public.disputes
  SET
    approved_refund_amount = requested_amount,
    status = 'resolved_customer'::public.dispute_status,
    resolved_at = now(),
    resolution_note = COALESCE(
      NULLIF(btrim(COALESCE(_reason, '')), ''),
      resolution_note
    ),
    updated_at = now()
  WHERE id = d.id;

  RETURN jsonb_build_object(
    'ok', true,
    'refund_id', refund_id,
    'amount', requested_amount,
    'remaining_order', round(remaining_order - requested_amount, 2),
    'remaining_split',
      CASE
        WHEN d.vendor_order_id IS NULL THEN NULL
        ELSE round(remaining_split - requested_amount, 2)
      END
  );
END
$$;

REVOKE ALL ON FUNCTION public.reserve_dispute_refund(uuid,numeric,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_dispute_refund(uuid,numeric,text,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT '20261002062000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
  TO service_role;
