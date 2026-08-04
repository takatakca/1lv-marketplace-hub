ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_status text NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS stripe_connect_last_checked_at timestamptz;