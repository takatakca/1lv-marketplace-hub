-- Refund/payout race safety.
-- Before a Stripe transfer starts, refunds recalculate the pending payout and
-- force re-review. Once a transfer is processing or paid, the original payout
-- remains immutable and an idempotent future clawback compensates the refund.

CREATE OR REPLACE FUNCTION public.finalize_refund_accounting(
  _refund_id uuid,
  _stripe_refund_id text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refund public.refund_records%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_vendor_order public.vendor_orders%ROWTYPE;
  v_reserved_total numeric := 0;
  v_refunded_total numeric := 0;
  v_vendor_refunded_total numeric := 0;
  v_vendor_refund_share numeric := 0;
  v_incremental_clawback numeric := 0;
  v_payout_item_id uuid;
  v_payout_id uuid;
  v_payout_status public.payout_status;
  v_payout_transfer_id text;
  v_items_gross numeric := 0;
  v_items_commission numeric := 0;
  v_items_refunds numeric := 0;
  v_items_net numeric := 0;
  v_applied_adjustments numeric := 0;
  v_recalculated_net numeric := 0;
  v_adjustment boolean := false;
  v_fully_refunded boolean := false;
  v_has_other_open_dispute boolean := false;
BEGIN
  IF _refund_id IS NULL
     OR COALESCE(btrim(_stripe_refund_id), '') !~ '^re_[A-Za-z0-9_]+$' THEN
    RAISE EXCEPTION 'Refund id and valid Stripe refund id are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_refund
  FROM public.refund_records
  WHERE id = _refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund record not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_refund.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund order not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_refund.status = 'refunded'::public.refund_status THEN
    IF v_refund.stripe_refund_id IS DISTINCT FROM _stripe_refund_id THEN
      RAISE EXCEPTION 'Refund is already linked to a different Stripe refund'
        USING ERRCODE = '23505';
    END IF;

    SELECT COALESCE(sum(amount), 0)
    INTO v_refunded_total
    FROM public.refund_records
    WHERE order_id = v_refund.order_id
      AND status = 'refunded'::public.refund_status;

    v_fully_refunded :=
      round(v_refunded_total, 2) >= round(v_order.total, 2);

    IF v_fully_refunded THEN
      PERFORM public.mark_order_promotion_refunded(v_refund.order_id);
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.payout_adjustments
      WHERE refund_id = v_refund.id
    )
    INTO v_adjustment;

    RETURN jsonb_build_object(
      'ok', true,
      'already_finalized', true,
      'adjustment', v_adjustment,
      'fully_refunded', v_fully_refunded
    );
  END IF;

  IF v_refund.status NOT IN (
    'approved'::public.refund_status,
    'processing'::public.refund_status,
    'failed'::public.refund_status
  ) THEN
    RAISE EXCEPTION 'Refund is not eligible for finalization'
      USING ERRCODE = '22023';
  END IF;

  IF lower(COALESCE(v_refund.currency, ''))
     <> lower(COALESCE(v_order.currency, 'CAD')) THEN
    RAISE EXCEPTION 'Refund currency does not match order currency'
      USING ERRCODE = '22023';
  END IF;

  IF v_refund.amount <= 0 OR v_refund.amount > v_order.total THEN
    RAISE EXCEPTION 'Refund amount is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(amount), 0)
  INTO v_reserved_total
  FROM public.refund_records
  WHERE order_id = v_refund.order_id
    AND id <> v_refund.id
    AND status IN (
      'approved'::public.refund_status,
      'processing'::public.refund_status,
      'refunded'::public.refund_status
    );

  IF round(v_reserved_total + v_refund.amount, 2)
     > round(v_order.total, 2) THEN
    RAISE EXCEPTION 'Refund would exceed order total'
      USING ERRCODE = '22023';
  END IF;

  IF v_refund.vendor_order_id IS NOT NULL THEN
    SELECT *
    INTO v_vendor_order
    FROM public.vendor_orders
    WHERE id = v_refund.vendor_order_id
    FOR UPDATE;

    IF FOUND THEN
      SELECT COALESCE(sum(amount), 0)
      INTO v_reserved_total
      FROM public.refund_records
      WHERE vendor_order_id = v_refund.vendor_order_id
        AND id <> v_refund.id
        AND status IN (
          'approved'::public.refund_status,
          'processing'::public.refund_status,
          'refunded'::public.refund_status
        );

      IF round(v_reserved_total + v_refund.amount, 2)
         > round(v_vendor_order.subtotal, 2) THEN
        RAISE EXCEPTION 'Refund would exceed vendor order subtotal'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  UPDATE public.refund_records
  SET
    status = 'refunded'::public.refund_status,
    stripe_refund_id = _stripe_refund_id,
    processed_at = COALESCE(processed_at, now()),
    failure_reason = NULL,
    updated_at = now()
  WHERE id = v_refund.id;

  IF v_refund.vendor_order_id IS NOT NULL
     AND v_vendor_order.id IS NOT NULL THEN
    SELECT COALESCE(sum(amount), 0)
    INTO v_vendor_refunded_total
    FROM public.refund_records
    WHERE vendor_order_id = v_refund.vendor_order_id
      AND status = 'refunded'::public.refund_status;

    v_vendor_refund_share := CASE
      WHEN COALESCE(v_vendor_order.subtotal, 0) <= 0 THEN 0
      ELSE round(
        LEAST(v_vendor_refunded_total, v_vendor_order.subtotal)
        * GREATEST(COALESCE(v_vendor_order.vendor_payout_amount, 0), 0)
        / v_vendor_order.subtotal,
        2
      )
    END;

    SELECT EXISTS (
      SELECT 1
      FROM public.disputes
      WHERE vendor_order_id = v_refund.vendor_order_id
        AND id IS DISTINCT FROM v_refund.dispute_id
        AND status IN (
          'open'::public.dispute_status,
          'under_review'::public.dispute_status,
          'waiting_customer'::public.dispute_status,
          'waiting_vendor'::public.dispute_status
        )
    )
    INTO v_has_other_open_dispute;

    UPDATE public.vendor_orders
    SET
      refund_amount = LEAST(
        v_vendor_refund_share,
        GREATEST(COALESCE(vendor_payout_amount, 0), 0)
      ),
      dispute_hold_amount = CASE
        WHEN v_has_other_open_dispute THEN dispute_hold_amount
        ELSE 0
      END,
      updated_at = now()
    WHERE id = v_refund.vendor_order_id;

    SELECT
      pi.id,
      p.id,
      p.status,
      p.stripe_transfer_id
    INTO
      v_payout_item_id,
      v_payout_id,
      v_payout_status,
      v_payout_transfer_id
    FROM public.payout_items AS pi
    JOIN public.payouts AS p ON p.id = pi.payout_id
    WHERE pi.vendor_order_id = v_refund.vendor_order_id
    ORDER BY p.created_at DESC, p.id
    LIMIT 1
    FOR UPDATE OF pi, p;

    IF v_payout_id IS NOT NULL THEN
      IF v_payout_status IN (
        'processing'::public.payout_status,
        'paid'::public.payout_status
      )
      OR v_payout_transfer_id IS NOT NULL THEN
        v_incremental_clawback := CASE
          WHEN COALESCE(v_vendor_order.subtotal, 0) <= 0 THEN 0
          ELSE round(
            LEAST(v_refund.amount, v_vendor_order.subtotal)
            * GREATEST(
                COALESCE(v_vendor_order.vendor_payout_amount, 0),
                0
              )
            / v_vendor_order.subtotal,
            2
          )
        END;

        IF v_incremental_clawback > 0 THEN
          INSERT INTO public.payout_adjustments (
            vendor_id,
            vendor_order_id,
            payout_id,
            refund_id,
            kind,
            amount,
            note
          )
          VALUES (
            v_vendor_order.vendor_id,
            v_refund.vendor_order_id,
            v_payout_id,
            v_refund.id,
            'refund_clawback',
            -v_incremental_clawback,
            'Stripe refund ' || _stripe_refund_id ||
              ' finalized after payout transfer processing began'
          )
          ON CONFLICT (refund_id)
            WHERE refund_id IS NOT NULL
          DO NOTHING;
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.payout_adjustments
          WHERE refund_id = v_refund.id
        )
        INTO v_adjustment;
      ELSE
        UPDATE public.payout_items
        SET
          refund_amount = v_vendor_refund_share,
          net_amount = GREATEST(
            round(
              (
                COALESCE(v_vendor_order.vendor_payout_amount, 0)
                - v_vendor_refund_share
              )::numeric,
              2
            ),
            0
          )
        WHERE id = v_payout_item_id;

        SELECT
          COALESCE(sum(gross_amount), 0),
          COALESCE(sum(commission_amount), 0),
          COALESCE(sum(refund_amount), 0),
          COALESCE(sum(net_amount), 0)
        INTO
          v_items_gross,
          v_items_commission,
          v_items_refunds,
          v_items_net
        FROM public.payout_items
        WHERE payout_id = v_payout_id;

        SELECT COALESCE(sum(amount), 0)
        INTO v_applied_adjustments
        FROM public.payout_adjustments
        WHERE applied_payout_id = v_payout_id;

        v_recalculated_net := round(
          (v_items_net + v_applied_adjustments)::numeric,
          2
        );

        UPDATE public.payouts
        SET
          gross_amount = round(v_items_gross::numeric, 2),
          commission_amount = round(v_items_commission::numeric, 2),
          refund_amount = round(v_items_refunds::numeric, 2),
          net_amount = v_recalculated_net,
          status = CASE
            WHEN v_payout_status = 'cancelled'::public.payout_status
              THEN 'cancelled'::public.payout_status
            ELSE 'held'::public.payout_status
          END,
          approved_by = NULL,
          approved_at = NULL,
          failure_reason = CASE
            WHEN v_payout_status = 'cancelled'::public.payout_status
              THEN failure_reason
            ELSE 'Refund changed payout amount; review before transfer.'
          END,
          next_retry_at = NULL,
          updated_at = now()
        WHERE id = v_payout_id;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(sum(amount), 0)
  INTO v_refunded_total
  FROM public.refund_records
  WHERE order_id = v_refund.order_id
    AND status = 'refunded'::public.refund_status;

  v_fully_refunded :=
    round(v_refunded_total, 2) >= round(v_order.total, 2);

  UPDATE public.orders
  SET
    payment_status = CASE
      WHEN v_fully_refunded
        THEN 'refunded'::public.payment_status
      ELSE 'partially_refunded'::public.payment_status
    END,
    status = CASE
      WHEN v_fully_refunded
        THEN 'refunded'::public.order_status
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_refund.order_id;

  IF v_fully_refunded THEN
    PERFORM public.mark_order_promotion_refunded(v_refund.order_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_finalized', false,
    'adjustment', v_adjustment,
    'fully_refunded', v_fully_refunded,
    'payout_recalculated',
      v_payout_id IS NOT NULL
      AND v_payout_status NOT IN (
        'processing'::public.payout_status,
        'paid'::public.payout_status
      )
      AND v_payout_transfer_id IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_refund_accounting(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_refund_accounting(uuid, text)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261002084500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
