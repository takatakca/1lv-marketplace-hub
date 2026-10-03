-- Make one valid CSV import row atomic: product draft creation and its
-- audit row either both commit or both roll back.

CREATE UNIQUE INDEX IF NOT EXISTS product_import_job_rows_job_row_unique
ON public.product_import_job_rows(job_id, row_index);

CREATE OR REPLACE FUNCTION public.import_product_draft_row(
  _job_id uuid,
  _row_index integer,
  _raw jsonb,
  _product jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_job_owner uuid;
  v_vendor_id uuid;
  v_job_status text;
  v_title text;
  v_price numeric;
  v_inventory_numeric numeric;
  v_inventory integer;
  v_slug_base text;
  v_slug text;
  v_product_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK session required'
      USING ERRCODE = '42501';
  END IF;

  IF _job_id IS NULL OR _row_index IS NULL OR _row_index < 1 THEN
    RAISE EXCEPTION 'Import job and positive source row index are required'
      USING ERRCODE = '22023';
  END IF;

  IF _raw IS NULL OR jsonb_typeof(_raw) <> 'object'
     OR _product IS NULL OR jsonb_typeof(_product) <> 'object' THEN
    RAISE EXCEPTION 'Import row payload must be JSON objects'
      USING ERRCODE = '22023';
  END IF;

  SELECT j.owner_id, j.vendor_id, j.status
  INTO v_job_owner, v_vendor_id, v_job_status
  FROM public.product_import_jobs AS j
  WHERE j.id = _job_id
  FOR UPDATE;

  IF v_job_owner IS NULL THEN
    RAISE EXCEPTION 'Import job not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_job_owner IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Import job does not belong to current vendor owner'
      USING ERRCODE = '42501';
  END IF;

  IF v_vendor_id IS NULL OR NOT public.owns_vendor(v_vendor_id, v_user_id) THEN
    RAISE EXCEPTION 'Import job vendor does not belong to current owner'
      USING ERRCODE = '42501';
  END IF;

  IF v_job_status <> 'processing' THEN
    RAISE EXCEPTION 'Import job is not processing'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_import_job_rows AS r
    WHERE r.job_id = _job_id
      AND r.row_index = _row_index
  ) THEN
    RAISE EXCEPTION 'Import source row already recorded'
      USING ERRCODE = '23505';
  END IF;

  v_title := NULLIF(btrim(COALESCE(_product->>'title', '')), '');
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Imported product requires a title'
      USING ERRCODE = '22023';
  END IF;

  -- products.price is numeric(10,2): validate the exact representable shape
  -- before casting so direct RPC callers cannot trigger overflow/rounding.
  IF COALESCE(_product->>'price', '') !~ '^[0-9]{1,8}([.][0-9]{1,2})?
  v_slug_base := trim(
    both '-'
    from regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g')
  );
  IF v_slug_base = '' THEN
    v_slug_base := 'product';
  END IF;
  v_slug := v_slug_base || '-' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  INSERT INTO public.products (
    vendor_id,
    slug,
    title,
    description,
    short_description,
    category_slug,
    price,
    compare_at_price,
    cost,
    sku,
    inventory_quantity,
    track_inventory,
    images,
    supplier_source,
    supplier_product_id,
    supplier_url,
    status
  )
  VALUES (
    v_vendor_id,
    v_slug,
    v_title,
    NULLIF(_product->>'description', ''),
    NULLIF(_product->>'short_description', ''),
    NULLIF(_product->>'category_slug', ''),
    v_price,
    NULL,
    NULL,
    NULLIF(_product->>'sku', ''),
    v_inventory,
    true,
    '[]'::jsonb,
    NULLIF(_product->>'supplier_source', ''),
    NULLIF(_product->>'supplier_product_id', ''),
    NULLIF(_product->>'supplier_url', ''),
    'draft'::public.product_status
  )
  RETURNING id INTO v_product_id;

  INSERT INTO public.product_import_job_rows(
    job_id,
    row_index,
    row_status,
    raw,
    errors,
    product_id
  )
  VALUES (
    _job_id,
    _row_index,
    'imported',
    _raw,
    '[]'::jsonb,
    v_product_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', v_product_id,
    'row_index', _row_index
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_product_draft_row(
  uuid,
  integer,
  jsonb,
  jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.import_product_draft_row(
  uuid,
  integer,
  jsonb,
  jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002183000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
 THEN
    RAISE EXCEPTION 'Imported product price is invalid'
      USING ERRCODE = '22023';
  END IF;
  v_price := (_product->>'price')::numeric;
  IF v_price < 0 OR v_price > 99999999.99 THEN
    RAISE EXCEPTION 'Imported product price is outside the supported range'
      USING ERRCODE = '22023';
  END IF;

  -- products.inventory_quantity is int4. Parse through numeric only after a
  -- bounded digit check, then range-check before the integer cast.
  IF COALESCE(_product->>'inventory_quantity', '') !~ '^[0-9]{1,10}
  v_slug_base := trim(
    both '-'
    from regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g')
  );
  IF v_slug_base = '' THEN
    v_slug_base := 'product';
  END IF;
  v_slug := v_slug_base || '-' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  INSERT INTO public.products (
    vendor_id,
    slug,
    title,
    description,
    short_description,
    category_slug,
    price,
    compare_at_price,
    cost,
    sku,
    inventory_quantity,
    track_inventory,
    images,
    supplier_source,
    supplier_product_id,
    supplier_url,
    status
  )
  VALUES (
    v_vendor_id,
    v_slug,
    v_title,
    NULLIF(_product->>'description', ''),
    NULLIF(_product->>'short_description', ''),
    NULLIF(_product->>'category_slug', ''),
    v_price,
    NULL,
    NULL,
    NULLIF(_product->>'sku', ''),
    v_inventory,
    true,
    '[]'::jsonb,
    NULLIF(_product->>'supplier_source', ''),
    NULLIF(_product->>'supplier_product_id', ''),
    NULLIF(_product->>'supplier_url', ''),
    'draft'::public.product_status
  )
  RETURNING id INTO v_product_id;

  INSERT INTO public.product_import_job_rows(
    job_id,
    row_index,
    row_status,
    raw,
    errors,
    product_id
  )
  VALUES (
    _job_id,
    _row_index,
    'imported',
    _raw,
    '[]'::jsonb,
    v_product_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', v_product_id,
    'row_index', _row_index
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_product_draft_row(
  uuid,
  integer,
  jsonb,
  jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.import_product_draft_row(
  uuid,
  integer,
  jsonb,
  jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002183000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
 THEN
    RAISE EXCEPTION 'Imported product inventory is invalid'
      USING ERRCODE = '22023';
  END IF;
  v_inventory_numeric := (_product->>'inventory_quantity')::numeric;
  IF v_inventory_numeric > 2147483647 THEN
    RAISE EXCEPTION 'Imported product inventory is outside the supported range'
      USING ERRCODE = '22023';
  END IF;
  v_inventory := v_inventory_numeric::integer;

  v_slug_base := trim(
    both '-'
    from regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g')
  );
  IF v_slug_base = '' THEN
    v_slug_base := 'product';
  END IF;
  v_slug := v_slug_base || '-' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  INSERT INTO public.products (
    vendor_id,
    slug,
    title,
    description,
    short_description,
    category_slug,
    price,
    compare_at_price,
    cost,
    sku,
    inventory_quantity,
    track_inventory,
    images,
    supplier_source,
    supplier_product_id,
    supplier_url,
    status
  )
  VALUES (
    v_vendor_id,
    v_slug,
    v_title,
    NULLIF(_product->>'description', ''),
    NULLIF(_product->>'short_description', ''),
    NULLIF(_product->>'category_slug', ''),
    v_price,
    NULL,
    NULL,
    NULLIF(_product->>'sku', ''),
    v_inventory,
    true,
    '[]'::jsonb,
    NULLIF(_product->>'supplier_source', ''),
    NULLIF(_product->>'supplier_product_id', ''),
    NULLIF(_product->>'supplier_url', ''),
    'draft'::public.product_status
  )
  RETURNING id INTO v_product_id;

  INSERT INTO public.product_import_job_rows(
    job_id,
    row_index,
    row_status,
    raw,
    errors,
    product_id
  )
  VALUES (
    _job_id,
    _row_index,
    'imported',
    _raw,
    '[]'::jsonb,
    v_product_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', v_product_id,
    'row_index', _row_index
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_product_draft_row(
  uuid,
  integer,
  jsonb,
  jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.import_product_draft_row(
  uuid,
  integer,
  jsonb,
  jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002183000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
