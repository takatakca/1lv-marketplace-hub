
-- 1. Drop overly permissive public policies for guest orders
DROP POLICY IF EXISTS "Anyone can view order by number lookup" ON public.orders;
DROP POLICY IF EXISTS "Anyone can view guest order items" ON public.order_items;

-- 2. Guest order lookup RPC (requires exact order number, returns minimal safe fields + items)
CREATE OR REPLACE FUNCTION public.lookup_guest_order(_order_number text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'order_number', o.order_number,
    'total', o.total,
    'status', o.status,
    'payment_status', o.payment_status,
    'created_at', o.created_at,
    'order_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'title', oi.title,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'status', oi.status,
        'tracking_number', oi.tracking_number,
        'carrier', oi.carrier
      ))
      FROM public.order_items oi WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  )
  FROM public.orders o
  WHERE o.order_number = _order_number
    AND o.customer_id IS NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.lookup_guest_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_guest_order(text) TO anon, authenticated;

-- 3. Public product browsing view (omits cost, sku, supplier_*)
DROP VIEW IF EXISTS public.public_products;
CREATE VIEW public.public_products AS
SELECT id, vendor_id, slug, title, description, short_description, category_slug,
       price, compare_at_price, inventory_quantity, track_inventory, images,
       status, created_at, updated_at
FROM public.products
WHERE status = 'active';
GRANT SELECT ON public.public_products TO anon, authenticated;

-- 4. Public vendor browsing view (omits contact_email, phone, address, stripe_*, commission_rate)
DROP VIEW IF EXISTS public.public_vendors;
CREATE VIEW public.public_vendors AS
SELECT id, user_id, slug, store_name, description, logo_url, banner_url,
       return_policy, shipping_policy, country, status, created_at, updated_at
FROM public.vendors
WHERE status = 'active';
GRANT SELECT ON public.public_vendors TO anon, authenticated;

-- 5. Remove the public-everyone read policies on base tables; revoke anon access entirely
DROP POLICY IF EXISTS "Active products viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Vendors are viewable by everyone" ON public.vendors;
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.vendors FROM anon;

-- Authenticated users (customers) still need to read active products & active vendor storefronts
-- via the base table for personal flows. Re-add narrow policies that only return active rows.
CREATE POLICY "Authenticated can view active products"
ON public.products
FOR SELECT
TO authenticated
USING (status = 'active');

CREATE POLICY "Authenticated can view active vendors"
ON public.vendors
FOR SELECT
TO authenticated
USING (status = 'active');

-- 6. RPC for checkout to fetch vendor commission rates without exposing the column publicly
CREATE OR REPLACE FUNCTION public.get_vendor_commission_rates(_vendor_ids uuid[])
RETURNS TABLE (id uuid, commission_rate numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.commission_rate
  FROM public.vendors v
  WHERE v.id = ANY(_vendor_ids);
$$;
REVOKE ALL ON FUNCTION public.get_vendor_commission_rates(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vendor_commission_rates(uuid[]) TO anon, authenticated;

-- 7. user_roles: explicit restrictive policies preventing self-assignment
CREATE POLICY "Only admins insert roles"
ON public.user_roles AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins update roles"
ON public.user_roles AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins delete roles"
ON public.user_roles AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
