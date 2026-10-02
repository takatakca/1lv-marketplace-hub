-- Vendor product publication authority.
-- A browser vendor may own/edit only its own products, may submit for review,
-- but may never self-approve/reject. Commercial edits to an active product
-- automatically return it to pending review; stock-only updates remain live.

CREATE OR REPLACE FUNCTION public.enforce_vendor_product_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_service boolean := current_user IN ('service_role', 'postgres', 'supabase_admin');
  v_vendor_ready boolean := false;
  v_commercial_change boolean := false;
BEGIN
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NOT NULL THEN
    v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);
  END IF;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated vendor session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    v.user_id = v_user_id
    AND v.status::text = 'active'
    AND v.subscription_status IN ('active', 'trialing')
  INTO v_vendor_ready
  FROM public.vendors AS v
  WHERE v.id = NEW.vendor_id
    AND v.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor cannot modify this product'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN (
      'draft'::public.product_status,
      'pending_review'::public.product_status
    ) THEN
      RAISE EXCEPTION 'Vendor products must start as draft or pending review'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'pending_review'::public.product_status
       AND NOT v_vendor_ready THEN
      RAISE EXCEPTION 'Vendor must be active with an active subscription before review'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    RAISE EXCEPTION 'Vendor ownership cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN (
      'active'::public.product_status,
      'rejected'::public.product_status
    ) THEN
      RAISE EXCEPTION 'Only marketplace admins may approve or reject products'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'pending_review'::public.product_status
       AND NOT v_vendor_ready THEN
      RAISE EXCEPTION 'Vendor must be active with an active subscription before review'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_commercial_change :=
    NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.short_description IS DISTINCT FROM OLD.short_description
    OR NEW.category_slug IS DISTINCT FROM OLD.category_slug
    OR NEW.price IS DISTINCT FROM OLD.price
    OR NEW.compare_at_price IS DISTINCT FROM OLD.compare_at_price
    OR NEW.images IS DISTINCT FROM OLD.images;

  IF OLD.status = 'active'::public.product_status
     AND NEW.status = 'active'::public.product_status
     AND v_commercial_change THEN
    IF NOT v_vendor_ready THEN
      RAISE EXCEPTION 'Vendor must be active with an active subscription before review'
        USING ERRCODE = '42501';
    END IF;
    NEW.status := 'pending_review'::public.product_status;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vendor_product_authority()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_vendor_authority ON public.products;
CREATE TRIGGER products_vendor_authority
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_vendor_product_authority();

DROP POLICY IF EXISTS "Vendors insert own products" ON public.products;
CREATE POLICY "Vendors insert own products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = products.vendor_id
      AND v.user_id = auth.uid()
  )
  AND status IN (
    'draft'::public.product_status,
    'pending_review'::public.product_status
  )
);

DROP POLICY IF EXISTS "Vendors update own products" ON public.products;
CREATE POLICY "Vendors update own products"
ON public.products
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = products.vendor_id
      AND v.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = products.vendor_id
      AND v.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Vendors delete own products" ON public.products;
CREATE POLICY "Vendors delete own products"
ON public.products
FOR DELETE
TO authenticated
USING (
  status = 'draft'::public.product_status
  AND EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = products.vendor_id
      AND v.user_id = auth.uid()
  )
);

-- Customer storefront reads use fixed-column public catalog RPCs. Authenticated
-- customers must never gain SELECT * access to cost/SKU/supplier fields on the
-- private products base table.
DROP POLICY IF EXISTS "Authenticated can view active products" ON public.products;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261002100000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
