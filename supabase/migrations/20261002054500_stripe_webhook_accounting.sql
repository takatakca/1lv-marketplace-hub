-- Atomic Stripe webhook claiming and refund accounting.

ALTER TABLE public.stripe_event_log
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.stripe_event_log ALTER COLUMN processed_at DROP NOT NULL;
ALTER TABLE public.stripe_event_log ALTER COLUMN processed_at DROP DEFAULT;
UPDATE public.stripe_event_log SET status='processed', processed_at=COALESCE(processed_at,now()), updated_at=now();
ALTER TABLE public.stripe_event_log DROP CONSTRAINT IF EXISTS stripe_event_log_status_check;
ALTER TABLE public.stripe_event_log ADD CONSTRAINT stripe_event_log_status_check CHECK (status IN ('processing','processed','failed'));

REVOKE ALL ON TABLE public.stripe_event_log FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.stripe_event_log TO authenticated;
GRANT ALL ON TABLE public.stripe_event_log TO service_role;

ALTER TABLE public.payout_adjustments
  ADD COLUMN IF NOT EXISTS refund_id uuid REFERENCES public.refund_records(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payout_adjustments_refund_unique
  ON public.payout_adjustments(refund_id) WHERE refund_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_stripe_event(_id text,_type text,_payload jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer:=0;
BEGIN
  IF COALESCE(btrim(_id),'')='' OR COALESCE(btrim(_type),'')='' OR _payload IS NULL THEN RETURN false; END IF;
  INSERT INTO public.stripe_event_log(id,type,payload,status,processed_at,updated_at,last_error)
  VALUES(_id,_type,_payload,'processing',NULL,now(),NULL)
  ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected=1 THEN RETURN true; END IF;
  UPDATE public.stripe_event_log
  SET type=_type,payload=_payload,status='processing',processed_at=NULL,updated_at=now(),last_error=NULL
  WHERE id=_id AND status='failed';
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END $$;
REVOKE ALL ON FUNCTION public.claim_stripe_event(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_refund_accounting(_refund_id uuid,_stripe_refund_id text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  r public.refund_records%ROWTYPE;
  o public.orders%ROWTYPE;
  vo public.vendor_orders%ROWTYPE;
  paid_payout_id uuid;
  total_refunded numeric:=0;
  vendor_refunded numeric:=0;
  vendor_refund_share numeric:=0;
  vendor_clawback numeric:=0;
  next_payment_status public.payment_status;
BEGIN
  IF _refund_id IS NULL OR COALESCE(btrim(_stripe_refund_id),'') !~ '^re_[A-Za-z0-9_]+$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_input');
  END IF;
  SELECT * INTO r FROM public.refund_records WHERE id=_refund_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','refund_not_found'); END IF;
  IF r.stripe_refund_id IS NOT NULL AND r.stripe_refund_id<>_stripe_refund_id THEN
    RETURN jsonb_build_object('ok',false,'reason','stripe_refund_conflict');
  END IF;
  IF r.status NOT IN ('approved','processing','refunded') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_refund_state');
  END IF;
  SELECT * INTO o FROM public.orders WHERE id=r.order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','order_not_found'); END IF;
  IF lower(COALESCE(r.currency,''))<>lower(COALESCE(o.currency,'CAD')) THEN
    RETURN jsonb_build_object('ok',false,'reason','currency_mismatch');
  END IF;
  IF r.amount<=0 OR r.amount>o.total THEN RETURN jsonb_build_object('ok',false,'reason','invalid_refund_amount'); END IF;

  UPDATE public.refund_records SET status='refunded',stripe_refund_id=_stripe_refund_id,
    processed_at=COALESCE(processed_at,now()),failure_reason=NULL,updated_at=now() WHERE id=r.id;

  SELECT COALESCE(sum(amount),0) INTO total_refunded FROM public.refund_records
    WHERE order_id=r.order_id AND status='refunded';
  IF total_refunded>o.total+0.005 THEN RAISE EXCEPTION 'Refund accounting exceeds order total for %',r.order_id; END IF;
  next_payment_status:=CASE WHEN total_refunded+0.005>=o.total THEN 'refunded'::public.payment_status ELSE 'partially_refunded'::public.payment_status END;
  UPDATE public.orders SET payment_status=next_payment_status,updated_at=now() WHERE id=r.order_id;

  IF r.vendor_order_id IS NOT NULL THEN
    SELECT * INTO vo FROM public.vendor_orders WHERE id=r.vendor_order_id FOR UPDATE;
    IF FOUND THEN
      SELECT COALESCE(sum(amount),0) INTO vendor_refunded FROM public.refund_records
        WHERE vendor_order_id=r.vendor_order_id AND status='refunded';

      vendor_refund_share:=CASE
        WHEN COALESCE(vo.subtotal,0)<=0 THEN 0
        ELSE round(
          LEAST(vendor_refunded,vo.subtotal)
          * GREATEST(COALESCE(vo.vendor_payout_amount,0),0)
          / vo.subtotal,
          2
        )
      END;

      UPDATE public.vendor_orders
      SET refund_amount=LEAST(vendor_refund_share,GREATEST(COALESCE(vendor_payout_amount,0),0)),
          dispute_hold_amount=0,
          updated_at=now()
      WHERE id=r.vendor_order_id;

      SELECT p.id INTO paid_payout_id FROM public.payout_items pi JOIN public.payouts p ON p.id=pi.payout_id
        WHERE pi.vendor_order_id=r.vendor_order_id AND p.status IN ('paid','processing')
        ORDER BY p.created_at DESC LIMIT 1;
      IF paid_payout_id IS NOT NULL THEN
        vendor_clawback:=CASE WHEN COALESCE(vo.subtotal,0)<=0 THEN 0 ELSE round(LEAST(r.amount,vo.subtotal)*GREATEST(COALESCE(vo.vendor_payout_amount,0),0)/vo.subtotal,2) END;
        IF vendor_clawback>0 THEN
          INSERT INTO public.payout_adjustments(vendor_id,vendor_order_id,payout_id,refund_id,kind,amount,note)
          VALUES(vo.vendor_id,vo.id,paid_payout_id,r.id,'refund',-vendor_clawback,'Automatic carry-forward for Stripe refund '||_stripe_refund_id)
          ON CONFLICT(refund_id) WHERE refund_id IS NOT NULL DO NOTHING;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'refund_id',r.id,'order_id',r.order_id,'payment_status',next_payment_status::text,
    'total_refunded',total_refunded,'payout_adjustment',CASE WHEN vendor_clawback>0 THEN -vendor_clawback ELSE 0 END);
END $$;
REVOKE ALL ON FUNCTION public.finalize_refund_accounting(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_refund_accounting(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT '20261002054500';
$$;
REVOKE ALL ON FUNCTION public.get_1lv_schema_version() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version() TO service_role;
