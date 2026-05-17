-- Add commission_rate to vendors (0.10 = 10%)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0.10;

-- Status enum for vendor_orders
DO $$ BEGIN
  CREATE TYPE public.vendor_order_status AS ENUM
    ('pending','accepted','processing','shipped','delivered','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.vendor_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  subtotal numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  vendor_payout_amount numeric NOT NULL DEFAULT 0,
  status public.vendor_order_status NOT NULL DEFAULT 'pending',
  tracking_number text,
  carrier text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS vendor_orders_order_id_idx  ON public.vendor_orders(order_id);
CREATE INDEX IF NOT EXISTS vendor_orders_vendor_id_idx ON public.vendor_orders(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_orders_status_idx    ON public.vendor_orders(status);

CREATE TRIGGER vendor_orders_touch_updated_at
  BEFORE UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.vendor_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors view own vendor orders"
  ON public.vendor_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_orders.vendor_id AND v.user_id = auth.uid()));

CREATE POLICY "Vendors update own vendor orders"
  ON public.vendor_orders FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_orders.vendor_id AND v.user_id = auth.uid()));

CREATE POLICY "Admins manage vendor orders"
  ON public.vendor_orders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow insertion during checkout (guest or authenticated) only when the
-- parent order's items match the vendor split being inserted.
CREATE POLICY "Checkout can insert vendor orders"
  ON public.vendor_orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = vendor_orders.order_id
        AND (o.customer_id IS NULL OR o.customer_id = auth.uid())
    )
  );
