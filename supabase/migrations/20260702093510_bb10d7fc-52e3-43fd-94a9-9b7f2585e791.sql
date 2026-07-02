-- Supplier integrations + product import jobs
-- SECURITY: credentials are NEVER stored in the frontend or returned to clients.
-- The `credentials_encrypted` column is a write-only placeholder; the Data API
-- does not select it (RLS-selectable columns are explicitly listed via views/queries).

CREATE TABLE IF NOT EXISTS public.supplier_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type IN ('csv','aliexpress_manual','cjdropshipping','custom_api')),
  provider_name text NOT NULL,
  status text NOT NULL DEFAULT 'setup_required' CHECK (status IN ('setup_required','active','disabled','error')),
  -- write-only credential blob; never selected by app code
  credentials_encrypted text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_integrations TO authenticated;
GRANT ALL ON public.supplier_integrations TO service_role;
ALTER TABLE public.supplier_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_integrations owner select"
  ON public.supplier_integrations FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "supplier_integrations owner insert"
  ON public.supplier_integrations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "supplier_integrations owner update"
  ON public.supplier_integrations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "supplier_integrations owner delete"
  ON public.supplier_integrations FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER supplier_integrations_touch
  BEFORE UPDATE ON public.supplier_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.product_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.supplier_integrations(id) ON DELETE SET NULL,
  provider_type text NOT NULL,
  source_filename text,
  file_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','partial')),
  total_rows int NOT NULL DEFAULT 0,
  success_rows int NOT NULL DEFAULT 0,
  failed_rows int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_import_jobs TO authenticated;
GRANT ALL ON public.product_import_jobs TO service_role;
ALTER TABLE public.product_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_jobs owner select"
  ON public.product_import_jobs FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "import_jobs owner insert"
  ON public.product_import_jobs FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "import_jobs owner update"
  ON public.product_import_jobs FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER product_import_jobs_touch
  BEFORE UPDATE ON public.product_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.product_import_job_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.product_import_jobs(id) ON DELETE CASCADE,
  row_index int NOT NULL,
  row_status text NOT NULL DEFAULT 'pending' CHECK (row_status IN ('pending','imported','failed','skipped')),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_import_job_rows TO authenticated;
GRANT ALL ON public.product_import_job_rows TO service_role;
ALTER TABLE public.product_import_job_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_job_rows owner select"
  ON public.product_import_job_rows FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.product_import_jobs j
    WHERE j.id = job_id AND (j.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ));
CREATE POLICY "import_job_rows owner insert"
  ON public.product_import_job_rows FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.product_import_jobs j
    WHERE j.id = job_id AND j.owner_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_import_jobs_owner ON public.product_import_jobs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_rows_job ON public.product_import_job_rows(job_id);
CREATE INDEX IF NOT EXISTS idx_supplier_integrations_owner ON public.supplier_integrations(owner_id);