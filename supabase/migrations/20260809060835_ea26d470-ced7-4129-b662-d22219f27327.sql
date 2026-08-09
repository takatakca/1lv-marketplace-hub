-- 1. Scheduler configuration on payout_settings
ALTER TABLE public.payout_settings
  ADD COLUMN IF NOT EXISTS payout_frequency text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS payout_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payout_hour_utc integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS auto_generate_payouts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_process_transfers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retry_failed_transfers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_transfer_attempts integer NOT NULL DEFAULT 3;

-- 2. Retry bookkeeping on payouts
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS transfer_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_transfer_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_status text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_note text;

-- 3. Scheduler locks
CREATE TABLE IF NOT EXISTS public.scheduler_locks (
  lock_name text PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);
GRANT ALL ON public.scheduler_locks TO service_role;
ALTER TABLE public.scheduler_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read scheduler locks" ON public.scheduler_locks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.scheduler_locks TO authenticated;

-- 4. Scheduler run history
CREATE TABLE IF NOT EXISTS public.payout_scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  trigger_source text NOT NULL DEFAULT 'manual',
  period_start date,
  period_end date,
  payouts_created integer NOT NULL DEFAULT 0,
  payouts_processed integer NOT NULL DEFAULT 0,
  payouts_failed integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payout_scheduler_runs TO service_role;
GRANT SELECT ON public.payout_scheduler_runs TO authenticated;
ALTER TABLE public.payout_scheduler_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read scheduler runs" ON public.payout_scheduler_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS payout_scheduler_runs_started_idx
  ON public.payout_scheduler_runs (started_at DESC);