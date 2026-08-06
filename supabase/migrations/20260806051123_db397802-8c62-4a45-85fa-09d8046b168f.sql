
-- vendor_orders extensions
ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispute_hold_amount numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.stamp_vendor_order_delivered()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if new.status = 'delivered' and new.delivered_at is null then
    new.delivered_at = now();
  end if;
  return new;
end; $$;

DROP TRIGGER IF EXISTS vendor_orders_stamp_delivered ON public.vendor_orders;
CREATE TRIGGER vendor_orders_stamp_delivered
BEFORE INSERT OR UPDATE ON public.vendor_orders
FOR EACH ROW EXECUTE FUNCTION public.stamp_vendor_order_delivered();

UPDATE public.vendor_orders SET delivered_at = updated_at
WHERE status = 'delivered' AND delivered_at IS NULL;

-- enum
DO $$ BEGIN
  CREATE TYPE public.payout_status AS ENUM
    ('draft','pending_review','approved','processing','paid','failed','held','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- payouts
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  refund_amount numeric NOT NULL DEFAULT 0,
  dispute_hold_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CAD',
  status public.payout_status NOT NULL DEFAULT 'draft',
  stripe_transfer_id text,
  failure_reason text,
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_vendor_idx ON public.payouts(vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS payouts_transfer_unique
  ON public.payouts(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;

GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors read own payouts" ON public.payouts;
CREATE POLICY "vendors read own payouts" ON public.payouts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = payouts.vendor_id AND v.user_id = auth.uid())
);

DROP TRIGGER IF EXISTS payouts_touch ON public.payouts;
CREATE TRIGGER payouts_touch BEFORE UPDATE ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- payout_items
CREATE TABLE IF NOT EXISTS public.payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.payouts(id) ON DELETE CASCADE,
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE RESTRICT,
  gross_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  refund_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payout_items_vendor_order_unique
  ON public.payout_items(vendor_order_id);
CREATE INDEX IF NOT EXISTS payout_items_payout_idx ON public.payout_items(payout_id);

GRANT SELECT ON public.payout_items TO authenticated;
GRANT ALL ON public.payout_items TO service_role;
ALTER TABLE public.payout_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors read own payout items" ON public.payout_items;
CREATE POLICY "vendors read own payout items" ON public.payout_items FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (
    SELECT 1 FROM public.payouts p JOIN public.vendors v ON v.id = p.vendor_id
    WHERE p.id = payout_items.payout_id AND v.user_id = auth.uid()
  )
);

-- payout_adjustments
CREATE TABLE IF NOT EXISTS public.payout_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  vendor_order_id uuid REFERENCES public.vendor_orders(id) ON DELETE SET NULL,
  payout_id uuid REFERENCES public.payouts(id) ON DELETE SET NULL,
  applied_payout_id uuid REFERENCES public.payouts(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'refund',
  amount numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payout_adjustments_vendor_idx ON public.payout_adjustments(vendor_id);

GRANT SELECT ON public.payout_adjustments TO authenticated;
GRANT ALL ON public.payout_adjustments TO service_role;
ALTER TABLE public.payout_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors read own payout adjustments" ON public.payout_adjustments;
CREATE POLICY "vendors read own payout adjustments" ON public.payout_adjustments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = payout_adjustments.vendor_id AND v.user_id = auth.uid())
);

-- payout_settings (single row)
CREATE TABLE IF NOT EXISTS public.payout_settings (
  id boolean PRIMARY KEY DEFAULT true,
  hold_days integer NOT NULL DEFAULT 7,
  auto_transfers_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_settings_single_row CHECK (id)
);
INSERT INTO public.payout_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.payout_settings TO authenticated;
GRANT ALL ON public.payout_settings TO service_role;
ALTER TABLE public.payout_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read payout settings" ON public.payout_settings;
CREATE POLICY "authenticated read payout settings" ON public.payout_settings FOR SELECT TO authenticated USING (true);
