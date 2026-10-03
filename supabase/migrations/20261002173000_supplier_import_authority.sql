-- Harden supplier/import tenant authority and protect server-only credential material.
-- Browser sessions may manage only their own vendor-scoped import metadata.
-- Encrypted supplier credentials remain service-role only at the privilege layer.

CREATE OR REPLACE FUNCTION public.enforce_supplier_integration_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_service boolean := current_user IN (
    'service_role',
    'postgres',
    'supabase_admin'
  );
BEGIN
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK session required'
      USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_admin AND NEW.owner_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Supplier integration ownership mismatch'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.credentials_encrypted IS NOT NULL THEN
      RAISE EXCEPTION 'Supplier credentials are server-authoritative'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Supplier integration owner is immutable'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.credentials_encrypted IS DISTINCT FROM OLD.credentials_encrypted THEN
      RAISE EXCEPTION 'Supplier credentials are server-authoritative'
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_admin AND NEW.owner_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Supplier integration ownership mismatch'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.vendor_id IS NOT NULL
     AND NOT public.owns_vendor(NEW.vendor_id, NEW.owner_id) THEN
    RAISE EXCEPTION 'Supplier integration vendor does not belong to owner'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin
     AND NEW.status IN ('active', 'error')
     AND (
       TG_OP = 'INSERT'
       OR NEW.status IS DISTINCT FROM OLD.status
     ) THEN
    RAISE EXCEPTION 'Supplier connection status is server-authoritative'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_supplier_integration_authority()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS supplier_integrations_authority
ON public.supplier_integrations;
CREATE TRIGGER supplier_integrations_authority
BEFORE INSERT OR UPDATE ON public.supplier_integrations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_supplier_integration_authority();

CREATE OR REPLACE FUNCTION public.enforce_product_import_job_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_service boolean := current_user IN (
    'service_role',
    'postgres',
    'supabase_admin'
  );
  v_integration_owner uuid;
  v_integration_vendor uuid;
BEGIN
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK session required'
      USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_admin AND NEW.owner_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Import job ownership mismatch'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.integration_id IS DISTINCT FROM OLD.integration_id
       OR NEW.provider_type IS DISTINCT FROM OLD.provider_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Import job identity fields are immutable'
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_admin AND NEW.owner_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Import job ownership mismatch'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.vendor_id IS NOT NULL
     AND NOT public.owns_vendor(NEW.vendor_id, NEW.owner_id) THEN
    RAISE EXCEPTION 'Import job vendor does not belong to owner'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.integration_id IS NOT NULL THEN
    SELECT si.owner_id, si.vendor_id
    INTO v_integration_owner, v_integration_vendor
    FROM public.supplier_integrations AS si
    WHERE si.id = NEW.integration_id;

    IF v_integration_owner IS NULL
       OR v_integration_owner IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Import integration does not belong to job owner'
        USING ERRCODE = '42501';
    END IF;

    IF v_integration_vendor IS NOT NULL
       AND v_integration_vendor IS DISTINCT FROM NEW.vendor_id THEN
      RAISE EXCEPTION 'Import integration vendor does not match job vendor'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_product_import_job_authority()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS product_import_jobs_authority
ON public.product_import_jobs;
CREATE TRIGGER product_import_jobs_authority
BEFORE INSERT OR UPDATE ON public.product_import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_product_import_job_authority();

CREATE OR REPLACE FUNCTION public.enforce_product_import_row_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_service boolean := current_user IN (
    'service_role',
    'postgres',
    'supabase_admin'
  );
  v_job_owner uuid;
  v_job_vendor uuid;
  v_product_vendor uuid;
BEGIN
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK session required'
      USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);

  SELECT j.owner_id, j.vendor_id
  INTO v_job_owner, v_job_vendor
  FROM public.product_import_jobs AS j
  WHERE j.id = NEW.job_id;

  IF v_job_owner IS NULL THEN
    RAISE EXCEPTION 'Import job not found'
      USING ERRCODE = '23503';
  END IF;

  IF NOT v_is_admin AND v_job_owner IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Import row job ownership mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    SELECT p.vendor_id
    INTO v_product_vendor
    FROM public.products AS p
    WHERE p.id = NEW.product_id;

    IF v_product_vendor IS NULL
       OR v_job_vendor IS NULL
       OR v_product_vendor IS DISTINCT FROM v_job_vendor THEN
      RAISE EXCEPTION 'Import row product does not belong to job vendor'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_product_import_row_authority()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS product_import_job_rows_authority
ON public.product_import_job_rows;
CREATE TRIGGER product_import_job_rows_authority
BEFORE INSERT OR UPDATE ON public.product_import_job_rows
FOR EACH ROW
EXECUTE FUNCTION public.enforce_product_import_row_authority();

-- Column-level privileges: authenticated clients cannot read or write
-- credentials_encrypted even if they construct their own Data API request.
REVOKE SELECT, INSERT, UPDATE ON TABLE public.supplier_integrations
FROM authenticated;

GRANT SELECT (
  id,
  vendor_id,
  owner_id,
  provider_type,
  provider_name,
  status,
  settings,
  created_at,
  updated_at
) ON TABLE public.supplier_integrations TO authenticated;

GRANT INSERT (
  vendor_id,
  owner_id,
  provider_type,
  provider_name,
  status,
  settings
) ON TABLE public.supplier_integrations TO authenticated;

GRANT UPDATE (
  vendor_id,
  provider_type,
  provider_name,
  status,
  settings
) ON TABLE public.supplier_integrations TO authenticated;

-- Job identity is set at creation and cannot be reassigned by a browser.
REVOKE INSERT, UPDATE ON TABLE public.product_import_jobs
FROM authenticated;

GRANT INSERT (
  vendor_id,
  owner_id,
  integration_id,
  provider_type,
  source_filename,
  file_url,
  status,
  total_rows,
  success_rows,
  failed_rows,
  errors
) ON TABLE public.product_import_jobs TO authenticated;

GRANT UPDATE (
  file_url,
  status,
  total_rows,
  success_rows,
  failed_rows,
  errors
) ON TABLE public.product_import_jobs TO authenticated;

-- Import rows are append-only from browser sessions.
REVOKE UPDATE, DELETE ON TABLE public.product_import_job_rows
FROM authenticated;

-- Strengthen tenant predicates at the RLS layer as well.
DROP POLICY IF EXISTS "supplier_integrations owner insert"
ON public.supplier_integrations;
CREATE POLICY "supplier_integrations owner insert"
ON public.supplier_integrations
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND (
    vendor_id IS NULL
    OR public.owns_vendor(vendor_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "supplier_integrations owner update"
ON public.supplier_integrations;
CREATE POLICY "supplier_integrations owner update"
ON public.supplier_integrations
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  AND (
    vendor_id IS NULL
    OR public.owns_vendor(vendor_id, owner_id)
  )
);

DROP POLICY IF EXISTS "import_jobs owner insert"
ON public.product_import_jobs;
CREATE POLICY "import_jobs owner insert"
ON public.product_import_jobs
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND (
    vendor_id IS NULL
    OR public.owns_vendor(vendor_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "import_jobs owner update"
ON public.product_import_jobs;
CREATE POLICY "import_jobs owner update"
ON public.product_import_jobs
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  AND (
    vendor_id IS NULL
    OR public.owns_vendor(vendor_id, owner_id)
  )
);

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002173000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
