
-- Allow guest checkout
ALTER TABLE public.orders ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_total numeric NOT NULL DEFAULT 0;

-- Guest insert policy (customer_id must be null when not authenticated)
DROP POLICY IF EXISTS "Guests can create guest orders" ON public.orders;
CREATE POLICY "Guests can create guest orders"
ON public.orders FOR INSERT
WITH CHECK (customer_id IS NULL);

DROP POLICY IF EXISTS "Guests can create guest order items" ON public.order_items;
CREATE POLICY "Guests can create guest order items"
ON public.order_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.customer_id IS NULL
  )
);

-- Allow lookup of an order by its order_number (used by confirmation page)
DROP POLICY IF EXISTS "Anyone can view order by number lookup" ON public.orders;
CREATE POLICY "Anyone can view order by number lookup"
ON public.orders FOR SELECT
USING (customer_id IS NULL);

DROP POLICY IF EXISTS "Anyone can view guest order items" ON public.order_items;
CREATE POLICY "Anyone can view guest order items"
ON public.order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.customer_id IS NULL
  )
);
