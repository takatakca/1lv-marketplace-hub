-- Finalize supplier import jobs from durable audit rows instead of trusting
-- browser-supplied success/failure counters.

CREATE OR REPLACE FUNCTION public.enforce_product_import_job_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_is_service boolean := current_user IN (
    'service_role',
    'postgres',
    'supabase_admin'
  );
BEGIN
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending', 'processing') THEN
      RAISE EXCEPTION 'Import jobs must start pending or processing'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.total_rows < 0
       OR NEW.success_rows <> 0
       OR NEW.failed_rows <> 0 THEN
      RAISE EXCEPTION 'Import job counters are server-authoritative'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.provider_type NOT IN (
      'csv',
      'aliexpress_manual',
      'cjdropshipping',
      'custom_api'
    ) THEN
      RAISE EXCEPTION 'Unsupported import provider type'
        USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.total_rows IS DISTINCT FROM OLD.total_rows
     OR NEW.success_rows IS DISTINCT FROM OLD.success_rows
     OR NEW.failed_rows IS DISTINCT FROM OLD.failed_rows
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.errors IS DISTINCT FROM OLD.errors THEN
    RAISE EXCEPTION 'Import job final state is server-authoritative'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_product_import_job_state()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS product_import_jobs_state_authority
ON public.product_import_jobs;
CREATE TRIGGER product_import_jobs_state_authority
BEFORE INSERT OR UPDATE ON public.product_import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_product_import_job_state();

REVOKE UPDATE (
  status,
  total_rows,
  success_rows,
  failed_rows,
  errors
) ON TABLE public.product_import_jobs
FROM authenticated;

CREATE OR REPLACE FUNCTION public.finalize_product_import_job(
  _job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_service boolean := current_user IN (
    'service_role',
    'postgres',
    'supabase_admin'
  );
  v_is_admin boolean := false;
  v_owner_id uuid;
  v_vendor_id uuid;
  v_status text;
  v_total_rows integer;
  v_recorded integer;
  v_success integer;
  v_failed integer;
  v_final_status text;
BEGIN
  IF NOT v_is_service THEN
    IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
      RAISE EXCEPTION 'Authorized TAKATAK session required'
        USING ERRCODE = '42501';
    END IF;

    v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);
  END IF;

  SELECT
    j.owner_id,
    j.vendor_id,
    j.status,
    j.total_rows
  INTO
    v_owner_id,
    v_vendor_id,
    v_status,
    v_total_rows
  FROM public.product_import_jobs AS j
  WHERE j.id = _job_id
  FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Import job not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_service
     AND NOT v_is_admin
     AND v_owner_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Import job does not belong to current user'
      USING ERRCODE = '42501';
  END IF;

  IF v_vendor_id IS NOT NULL
     AND NOT public.owns_vendor(v_vendor_id, v_owner_id) THEN
    RAISE EXCEPTION 'Import job vendor does not belong to owner'
      USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'processing' THEN
    RAISE EXCEPTION 'Only processing import jobs can be finalized'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE r.row_status = 'imported')::integer,
    count(*) FILTER (
      WHERE r.row_status IN ('failed', 'skipped')
    )::integer
  INTO
    v_recorded,
    v_success,
    v_failed
  FROM public.product_import_job_rows AS r
  WHERE r.job_id = _job_id;

  IF v_recorded IS DISTINCT FROM v_total_rows THEN
    RAISE EXCEPTION
      'Import job audit row count mismatch: expected %, recorded %',
      v_total_rows,
      v_recorded
      USING ERRCODE = '22023';
  END IF;

  v_final_status := CASE
    WHEN v_failed = 0 THEN 'completed'
    WHEN v_success = 0 THEN 'failed'
    ELSE 'partial'
  END;

  UPDATE public.product_import_jobs
  SET
    status = v_final_status,
    success_rows = v_success,
    failed_rows = v_failed,
    errors = '[]'::jsonb,
    updated_at = now()
  WHERE id = _job_id;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', _job_id,
    'status', v_final_status,
    'total_rows', v_total_rows,
    'success_rows', v_success,
    'failed_rows', v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_product_import_job(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.finalize_product_import_job(uuid)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002184500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
