-- Atomic payout generation.
-- All financial inputs are re-read and locked inside one PostgreSQL transaction
-- immediately before a payout and its items are created. This prevents a
-- concurrent refund from being omitted between Node-side reads and inserts.

CREATE OR REPLACE FUNCTION public.create_vendor_payout_atomic(
  _vendor_id uuid,
  _period_start date,
  _period_end date,
  _eligible_through timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payouts_enabled boolean := false;
  v_item_count bigint := 0;
  v_inserted_items integer := 0;
  v_adjustment_count bigint := 0;
  v_claimed_adjustments integer := 0;
  v_gross numeric := 0;
  v_commission numeric := 0;
  v_refunds numeric := 0;
  v_holds numeric := 0;
  v_items_net numeric := 0;
  v_adjustments numeric := 0;
  v_net numeric := 0;
  v_payout_id uuid;
  v_unresolved_clawback boolean := false;
BEGIN
  IF _vendor_id IS NULL
     OR _period_start IS NULL
     OR _period_end IS NULL
     OR _eligible_through IS NULL THEN
    RAISE EXCEPTION 'Payout generation inputs are required'
      USING ERRCODE = '22023';
  END IF;

  IF _period_start > _period_end THEN
    RAISE EXCEPTION 'Payout period start must be on or before period end'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize payout generation for this vendor even if two scheduler workers
  -- reach the same vendor concurrently. This lock is transaction-scoped.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(_vendor_id::text, 90000)
  );

  SELECT payouts_enabled
  INTO v_payouts_enabled
  FROM public.vendors
  WHERE id = _vendor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'created', false,
      'reason', 'vendor_not_found'
    );
  END IF;

  IF NOT COALESCE(v_payouts_enabled, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'reason', 'vendor_payouts_disabled'
    );
  END IF;

  -- Lock every currently eligible vendor-order row before any financial
  -- aggregate is calculated. Refund finalization updates the same rows, so a
  -- concurrent refund must either finish first (and be included below) or wait
  -- until this transaction creates a reviewable payout that it can recalculate.
  PERFORM vo.id
  FROM public.vendor_orders AS vo
  JOIN public.orders AS o ON o.id = vo.order_id
  WHERE vo.vendor_id = _vendor_id
    AND vo.status = 'delivered'::public.vendor_order_status
    AND vo.delivered_at IS NOT NULL
    AND vo.delivered_at <= _eligible_through
    AND o.payment_status IN (
      'paid'::public.payment_status,
      'partially_refunded'::public.payment_status
    )
    AND COALESCE(vo.dispute_hold_amount, 0) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.payout_items AS pi
      WHERE pi.vendor_order_id = vo.id
    )
  ORDER BY vo.id
  FOR UPDATE OF vo;

  SELECT
    count(*)::bigint,
    round(COALESCE(sum(vo.subtotal), 0)::numeric, 2),
    round(COALESCE(sum(vo.commission_amount), 0)::numeric, 2),
    round(COALESCE(sum(vo.refund_amount), 0)::numeric, 2),
    round(COALESCE(sum(vo.dispute_hold_amount), 0)::numeric, 2),
    round(
      COALESCE(
        sum(
          GREATEST(
            COALESCE(vo.vendor_payout_amount, 0)
            - COALESCE(vo.refund_amount, 0)
            - COALESCE(vo.dispute_hold_amount, 0),
            0
          )
        ),
        0
      )::numeric,
      2
    )
  INTO
    v_item_count,
    v_gross,
    v_commission,
    v_refunds,
    v_holds,
    v_items_net
  FROM public.vendor_orders AS vo
  JOIN public.orders AS o ON o.id = vo.order_id
  WHERE vo.vendor_id = _vendor_id
    AND vo.status = 'delivered'::public.vendor_order_status
    AND vo.delivered_at IS NOT NULL
    AND vo.delivered_at <= _eligible_through
    AND o.payment_status IN (
      'paid'::public.payment_status,
      'partially_refunded'::public.payment_status
    )
    AND COALESCE(vo.dispute_hold_amount, 0) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.payout_items AS pi
      WHERE pi.vendor_order_id = vo.id
    );

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'reason', 'no_eligible_orders'
    );
  END IF;

  -- Lock all currently pending adjustments for the vendor. Refund clawbacks are
  -- only consumable once their source payout is conclusively paid and carries
  -- no negative reconciliation result.
  PERFORM pa.id
  FROM public.payout_adjustments AS pa
  WHERE pa.vendor_id = _vendor_id
    AND pa.applied_payout_id IS NULL
  ORDER BY pa.id
  FOR UPDATE;

  SELECT EXISTS (
    SELECT 1
    FROM public.payout_adjustments AS pa
    WHERE pa.vendor_id = _vendor_id
      AND pa.applied_payout_id IS NULL
      AND pa.kind = 'refund_clawback'
      AND (
        pa.payout_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.payouts AS source
          WHERE source.id = pa.payout_id
            AND (
              (
                source.status = 'paid'::public.payout_status
                AND source.stripe_transfer_id IS NOT NULL
                AND (
                  source.reconciliation_status IS NULL
                  OR source.reconciliation_status = 'matched'
                )
              )
              OR (
                source.status = 'cancelled'::public.payout_status
                AND source.stripe_transfer_id IS NULL
              )
            )
        )
      )
  )
  INTO v_unresolved_clawback;

  IF v_unresolved_clawback THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'reason', 'unresolved_refund_clawback'
    );
  END IF;

  SELECT
    count(*)::bigint,
    round(COALESCE(sum(pa.amount), 0)::numeric, 2)
  INTO
    v_adjustment_count,
    v_adjustments
  FROM public.payout_adjustments AS pa
  WHERE pa.vendor_id = _vendor_id
    AND pa.applied_payout_id IS NULL
    AND (
      COALESCE(pa.kind, '') <> 'refund_clawback'
      OR EXISTS (
        SELECT 1
        FROM public.payouts AS source
        WHERE source.id = pa.payout_id
          AND source.status = 'paid'::public.payout_status
          AND source.stripe_transfer_id IS NOT NULL
          AND (
            source.reconciliation_status IS NULL
            OR source.reconciliation_status = 'matched'
          )
      )
    );

  v_net := round((v_items_net + v_adjustments)::numeric, 2);

  IF v_net <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'reason', 'non_positive_net',
      'net_amount', v_net
    );
  END IF;

  INSERT INTO public.payouts (
    vendor_id,
    period_start,
    period_end,
    gross_amount,
    commission_amount,
    refund_amount,
    dispute_hold_amount,
    net_amount,
    status
  )
  VALUES (
    _vendor_id,
    _period_start,
    _period_end,
    v_gross,
    v_commission,
    v_refunds,
    v_holds,
    v_net,
    'pending_review'::public.payout_status
  )
  RETURNING id INTO v_payout_id;

  INSERT INTO public.payout_items (
    payout_id,
    vendor_order_id,
    gross_amount,
    commission_amount,
    refund_amount,
    net_amount
  )
  SELECT
    v_payout_id,
    vo.id,
    COALESCE(vo.subtotal, 0),
    COALESCE(vo.commission_amount, 0),
    COALESCE(vo.refund_amount, 0),
    GREATEST(
      round(
        (
          COALESCE(vo.vendor_payout_amount, 0)
          - COALESCE(vo.refund_amount, 0)
          - COALESCE(vo.dispute_hold_amount, 0)
        )::numeric,
        2
      ),
      0
    )
  FROM public.vendor_orders AS vo
  JOIN public.orders AS o ON o.id = vo.order_id
  WHERE vo.vendor_id = _vendor_id
    AND vo.status = 'delivered'::public.vendor_order_status
    AND vo.delivered_at IS NOT NULL
    AND vo.delivered_at <= _eligible_through
    AND o.payment_status IN (
      'paid'::public.payment_status,
      'partially_refunded'::public.payment_status
    )
    AND COALESCE(vo.dispute_hold_amount, 0) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.payout_items AS existing
      WHERE existing.vendor_order_id = vo.id
    )
  ORDER BY vo.id;

  GET DIAGNOSTICS v_inserted_items = ROW_COUNT;

  IF v_inserted_items <> v_item_count THEN
    RAISE EXCEPTION
      'Atomic payout item count changed during generation (% expected, % inserted)',
      v_item_count,
      v_inserted_items
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.payout_adjustments AS pa
  SET applied_payout_id = v_payout_id
  WHERE pa.vendor_id = _vendor_id
    AND pa.applied_payout_id IS NULL
    AND (
      COALESCE(pa.kind, '') <> 'refund_clawback'
      OR EXISTS (
        SELECT 1
        FROM public.payouts AS source
        WHERE source.id = pa.payout_id
          AND source.status = 'paid'::public.payout_status
          AND source.stripe_transfer_id IS NOT NULL
          AND (
            source.reconciliation_status IS NULL
            OR source.reconciliation_status = 'matched'
          )
      )
    );

  GET DIAGNOSTICS v_claimed_adjustments = ROW_COUNT;

  IF v_claimed_adjustments <> v_adjustment_count THEN
    RAISE EXCEPTION
      'Atomic payout adjustment count changed during generation (% expected, % claimed)',
      v_adjustment_count,
      v_claimed_adjustments
      USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'payout_id', v_payout_id,
    'item_count', v_item_count,
    'adjustment_count', v_adjustment_count,
    'net_amount', v_net
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_vendor_payout_atomic(
  uuid,
  date,
  date,
  timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_vendor_payout_atomic(
  uuid,
  date,
  date,
  timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261002090000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
