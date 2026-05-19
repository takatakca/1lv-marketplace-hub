-- Extend payment_status enum
DO $$ BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'processing';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refunded';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'partially_refunded';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'failed';
EXCEPTION WHEN others THEN NULL; END $$;

-- Orders: stripe ids
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_pi ON public.orders(stripe_payment_intent_id);

-- Vendors: subscription + connect
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS subscription_plan text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS charges_enabled boolean NOT NULL DEFAULT false;

-- Stripe webhook event log (idempotency)
CREATE TABLE IF NOT EXISTS public.stripe_event_log (
  id text PRIMARY KEY,
  type text NOT NULL,
  payload jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read stripe events" ON public.stripe_event_log
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));