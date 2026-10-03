-- Database-authoritative bulk catalog and inventory operations for vendors.
-- Replaces browser-side N-request loops with bounded, audited, atomic RPCs.

CREATE TYPE public.vendor_catalog_audit_kind AS ENUM (
  'bulk_status',
  'bulk_inventory'
);

CREATE TABLE public.vendor_catalog_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  kind public.vendor_catalog_audit_kind NOT NULL,
  affected_count integer NOT NULL CHECK (affected_count >= 0),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_catalog_audit_request_size CHECK (
    octet_length(request_payload::text) <= 131072
  ),
  CONSTRAINT vendor_catalog_audit_result_size CHECK (
    octet_length(result_payload::text) <= 131072
  )
);

CREATE INDEX vendor_catalog_audit_vendor_idx
ON public.vendor_catalog_audit_events (vendor_id, created_at DESC, id DESC);

ALTER TABLE public.vendor_catalog_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.vendor_catalog_audit_events
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

REVOKE ALL ON TABLE public.vendor_catalog_audit_events
FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.vendor_catalog_audit_events FROM service_role;
GRANT SELECT, INSERT
ON TABLE public.vendor_catalog_audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.require_vendor_catalog_authority(
  _vendor_id uuid
)
RETURNS public.vendors
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_vendor public.vendors%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK vendor session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_vendor
  FROM public.vendors
  WHERE id = _vendor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_vendor.user_id <> v_user_id
     AND NOT public.has_role(v_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Vendor catalog access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_vendor;
END;
$$;

REVOKE ALL ON FUNCTION public.require_vendor_catalog_authority(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_vendor_catalog_authority(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.bulk_set_vendor_product_status(
  _vendor_id uuid,
  _product_ids uuid[],
  _requested_status public.product_status
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_vendor public.vendors%ROWTYPE;
  v_require_approval boolean;
  v_effective_status public.product_status;
  v_requested_count integer;
  v_owned_count integer;
  v_affected integer;
  v_id uuid;
BEGIN
  v_vendor := public.require_vendor_catalog_authority(_vendor_id);

  v_requested_count := cardinality(COALESCE(_product_ids, ARRAY[]::uuid[]));

  IF v_requested_count < 1 OR v_requested_count > 500 THEN
    RAISE EXCEPTION 'Bulk product status operation requires 1 to 500 products'
      USING ERRCODE = '22023';
  END IF;

  IF _requested_status NOT IN (
    'draft'::public.product_status,
    'pending_review'::public.product_status,
    'archived'::public.product_status
  ) THEN
    RAISE EXCEPTION 'Vendor bulk status may only request draft, pending review or archived'
      USING ERRCODE = '42501';
  END IF;

  IF (
    SELECT count(DISTINCT requested_id)
    FROM unnest(_product_ids) AS requested(requested_id)
  ) <> v_requested_count THEN
    RAISE EXCEPTION 'Bulk product status request contains duplicate product ids'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_owned_count
  FROM public.products
  WHERE vendor_id = _vendor_id
    AND id = ANY(_product_ids);

  IF v_owned_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more products do not belong to this vendor'
      USING ERRCODE = '42501';
  END IF;

  IF _requested_status = 'pending_review'::public.product_status THEN
    IF v_vendor.status <> 'active'::public.vendor_status
       OR v_vendor.subscription_status NOT IN ('active', 'trialing') THEN
      RAISE EXCEPTION 'Vendor must be active with an active subscription before review'
        USING ERRCODE = '42501';
    END IF;

    SELECT require_product_approval
    INTO v_require_approval
    FROM public.marketplace_settings
    WHERE id = true;

    IF v_require_approval IS NULL THEN
      RAISE EXCEPTION 'Marketplace product settings are unavailable'
        USING ERRCODE = 'P0001';
    END IF;

    v_effective_status := CASE
      WHEN v_require_approval
        THEN 'pending_review'::public.product_status
      ELSE 'active'::public.product_status
    END;
  ELSE
    v_effective_status := _requested_status;
  END IF;

  FOR v_id IN
    SELECT id
    FROM public.products
    WHERE vendor_id = _vendor_id
      AND id = ANY(_product_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    PERFORM 1;
  END LOOP;

  UPDATE public.products
  SET
    status = v_effective_status,
    updated_at = now()
  WHERE vendor_id = _vendor_id
    AND id = ANY(_product_ids);

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  INSERT INTO public.vendor_catalog_audit_events (
    vendor_id,
    actor_user_id,
    kind,
    affected_count,
    request_payload,
    result_payload
  )
  VALUES (
    _vendor_id,
    v_user_id,
    'bulk_status'::public.vendor_catalog_audit_kind,
    v_affected,
    jsonb_build_object(
      'product_ids', to_jsonb(_product_ids),
      'requested_status', _requested_status::text
    ),
    jsonb_build_object(
      'effective_status', v_effective_status::text,
      'affected_count', v_affected
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'vendor_id', _vendor_id,
    'requested_status', _requested_status::text,
    'effective_status', v_effective_status::text,
    'affected_count', v_affected
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_set_vendor_product_status(
  uuid, uuid[], public.product_status
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_set_vendor_product_status(
  uuid, uuid[], public.product_status
) TO authenticated;

CREATE OR REPLACE FUNCTION public.bulk_adjust_vendor_inventory(
  _vendor_id uuid,
  _operations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_vendor public.vendors%ROWTYPE;
  v_operation record;
  v_product public.products%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_current integer;
  v_next integer;
  v_affected integer := 0;
  v_parent_count integer := 0;
  v_variant_count integer := 0;
BEGIN
  v_vendor := public.require_vendor_catalog_authority(_vendor_id);

  IF _operations IS NULL
     OR jsonb_typeof(_operations) <> 'array'
     OR jsonb_array_length(_operations) < 1
     OR jsonb_array_length(_operations) > 1000 THEN
    RAISE EXCEPTION 'Bulk inventory operation requires 1 to 1000 entries'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_operations) AS entry
    WHERE COALESCE(entry->>'product_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (
        COALESCE(entry->>'variant_id', '') <> ''
        AND COALESCE(entry->>'variant_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      OR COALESCE(entry->>'mode', '') NOT IN ('set', 'delta')
      OR COALESCE(entry->>'quantity', '') !~ '^-?[0-9]{1,9}$'
  ) THEN
    RAISE EXCEPTION 'Invalid bulk inventory operation shape'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        (entry->>'product_id')::uuid AS product_id,
        NULLIF(entry->>'variant_id', '')::uuid AS variant_id,
        count(*) AS entry_count
      FROM jsonb_array_elements(_operations) AS entry
      GROUP BY
        (entry->>'product_id')::uuid,
        NULLIF(entry->>'variant_id', '')::uuid
      HAVING count(*) > 1
    ) AS duplicates
  ) THEN
    RAISE EXCEPTION 'Bulk inventory request contains duplicate product/SKU targets'
      USING ERRCODE = '22023';
  END IF;

  FOR v_operation IN
    SELECT
      (entry->>'product_id')::uuid AS product_id,
      NULLIF(entry->>'variant_id', '')::uuid AS variant_id,
      entry->>'mode' AS mode,
      (entry->>'quantity')::integer AS quantity
    FROM jsonb_array_elements(_operations) AS entry
    ORDER BY
      (entry->>'product_id')::uuid,
      NULLIF(entry->>'variant_id', '')::uuid NULLS FIRST
  LOOP
    SELECT *
    INTO v_product
    FROM public.products
    WHERE id = v_operation.product_id
      AND vendor_id = _vendor_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory target product does not belong to vendor'
        USING ERRCODE = '42501';
    END IF;

    IF v_operation.variant_id IS NOT NULL THEN
      SELECT *
      INTO v_variant
      FROM public.product_variants
      WHERE id = v_operation.variant_id
        AND product_id = v_product.id
        AND vendor_id = _vendor_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory target SKU does not belong to vendor product'
          USING ERRCODE = '42501';
      END IF;

      v_current := v_variant.inventory_quantity;
      v_next := CASE
        WHEN v_operation.mode = 'set' THEN v_operation.quantity
        ELSE v_current + v_operation.quantity
      END;

      IF v_next < 0 OR v_next > 100000000 THEN
        RAISE EXCEPTION 'SKU inventory result is outside allowed bounds'
          USING ERRCODE = '22023';
      END IF;

      UPDATE public.product_variants
      SET
        inventory_quantity = v_next,
        updated_at = now()
      WHERE id = v_variant.id;

      v_variant_count := v_variant_count + 1;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.product_variants
        WHERE product_id = v_product.id
          AND active = true
      ) THEN
        RAISE EXCEPTION 'Variantized product inventory must target an exact SKU'
          USING ERRCODE = '22023';
      END IF;

      v_current := v_product.inventory_quantity;
      v_next := CASE
        WHEN v_operation.mode = 'set' THEN v_operation.quantity
        ELSE v_current + v_operation.quantity
      END;

      IF v_next < 0 OR v_next > 100000000 THEN
        RAISE EXCEPTION 'Product inventory result is outside allowed bounds'
          USING ERRCODE = '22023';
      END IF;

      UPDATE public.products
      SET
        inventory_quantity = v_next,
        updated_at = now()
      WHERE id = v_product.id;

      v_parent_count := v_parent_count + 1;
    END IF;

    v_affected := v_affected + 1;
  END LOOP;

  INSERT INTO public.vendor_catalog_audit_events (
    vendor_id,
    actor_user_id,
    kind,
    affected_count,
    request_payload,
    result_payload
  )
  VALUES (
    _vendor_id,
    v_user_id,
    'bulk_inventory'::public.vendor_catalog_audit_kind,
    v_affected,
    jsonb_build_object(
      'operation_count', jsonb_array_length(_operations),
      'operations', _operations
    ),
    jsonb_build_object(
      'affected_count', v_affected,
      'parent_products', v_parent_count,
      'variants', v_variant_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'vendor_id', _vendor_id,
    'affected_count', v_affected,
    'parent_products', v_parent_count,
    'variants', v_variant_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_adjust_vendor_inventory(uuid, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_adjust_vendor_inventory(uuid, jsonb)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vendor_inventory_snapshot(
  _vendor_id uuid,
  _limit integer DEFAULT 500,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  product_id uuid,
  product_title text,
  product_status public.product_status,
  variant_id uuid,
  sku text,
  inventory_quantity integer,
  track_inventory boolean,
  variant_active boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_vendor_catalog_authority(_vendor_id);

  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.status,
    pv.id,
    COALESCE(pv.sku, p.sku),
    COALESCE(pv.inventory_quantity, p.inventory_quantity),
    COALESCE(pv.track_inventory, p.track_inventory),
    COALESCE(pv.active, true),
    GREATEST(p.updated_at, COALESCE(pv.updated_at, p.updated_at))
  FROM public.products AS p
  LEFT JOIN public.product_variants AS pv
    ON pv.product_id = p.id
  WHERE p.vendor_id = _vendor_id
  ORDER BY p.updated_at DESC, p.id, pv.position, pv.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 500), 1), 2000)
  OFFSET LEAST(GREATEST(COALESCE(_offset, 0), 0), 100000);
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_inventory_snapshot(
  uuid, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_inventory_snapshot(
  uuid, integer, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_vendor_catalog_audit_events(
  _vendor_id uuid,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  kind public.vendor_catalog_audit_kind,
  affected_count integer,
  request_payload jsonb,
  result_payload jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_vendor_catalog_authority(_vendor_id);

  RETURN QUERY
  SELECT
    e.id,
    e.kind,
    e.affected_count,
    e.request_payload,
    e.result_payload,
    e.created_at
  FROM public.vendor_catalog_audit_events AS e
  WHERE e.vendor_id = _vendor_id
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.list_vendor_catalog_audit_events(uuid, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_vendor_catalog_audit_events(uuid, integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003052000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
