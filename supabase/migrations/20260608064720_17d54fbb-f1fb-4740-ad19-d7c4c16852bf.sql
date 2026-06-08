
-- Recreate views with SECURITY INVOKER so they honor RLS of the caller
DROP VIEW IF EXISTS public.public_products;
CREATE VIEW public.public_products
WITH (security_invoker = true) AS
SELECT id, vendor_id, slug, title, description, short_description, category_slug,
       price, compare_at_price, inventory_quantity, track_inventory, images,
       status, created_at, updated_at
FROM public.products
WHERE status = 'active';
GRANT SELECT ON public.public_products TO anon, authenticated;

DROP VIEW IF EXISTS public.public_vendors;
CREATE VIEW public.public_vendors
WITH (security_invoker = true) AS
SELECT id, user_id, slug, store_name, description, logo_url, banner_url,
       return_policy, shipping_policy, country, status, created_at, updated_at
FROM public.vendors
WHERE status = 'active';
GRANT SELECT ON public.public_vendors TO anon, authenticated;

-- Anon needs row-level + column-level access on safe columns of the base tables for the views to work
CREATE POLICY "Anon can view active products"
ON public.products
FOR SELECT
TO anon
USING (status = 'active');

CREATE POLICY "Anon can view active vendors"
ON public.vendors
FOR SELECT
TO anon
USING (status = 'active');

GRANT SELECT (
  id, vendor_id, slug, title, description, short_description, category_slug,
  price, compare_at_price, inventory_quantity, track_inventory, images,
  status, created_at, updated_at
) ON public.products TO anon;

GRANT SELECT (
  id, user_id, slug, store_name, description, logo_url, banner_url,
  return_policy, shipping_policy, country, status, created_at, updated_at
) ON public.vendors TO anon;
