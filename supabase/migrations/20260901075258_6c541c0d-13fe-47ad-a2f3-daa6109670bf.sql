ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS takatak_person_id text;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS takatak_company_id text,
  ADD COLUMN IF NOT EXISTS takatak_merchant_id text,
  ADD COLUMN IF NOT EXISTS takatak_sync_status text NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS takatak_last_synced_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS takatak_customer_id text,
  ADD COLUMN IF NOT EXISTS takatak_order_event_id text;

CREATE TABLE IF NOT EXISTS public.takatak_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  source_application text NOT NULL DEFAULT '1lv',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  remote_id text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  CONSTRAINT takatak_outbox_status_chk CHECK (status IN ('pending','processing','delivered','failed'))
);

GRANT SELECT ON public.takatak_outbox TO authenticated;
GRANT ALL ON public.takatak_outbox TO service_role;

ALTER TABLE public.takatak_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view takatak outbox"
ON public.takatak_outbox FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS takatak_outbox_pending_idx
  ON public.takatak_outbox (status, next_attempt_at);

CREATE TRIGGER takatak_outbox_touch
BEFORE UPDATE ON public.takatak_outbox
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();