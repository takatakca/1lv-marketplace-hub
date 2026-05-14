
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS shipping_policy text,
  ADD COLUMN IF NOT EXISTS return_policy text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'vendors_slug_unique') THEN
    CREATE UNIQUE INDEX vendors_slug_unique ON public.vendors (slug);
  END IF;
END $$;

DROP TRIGGER IF EXISTS vendors_set_updated_at ON public.vendors;
CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_fr text,
  parent_slug text,
  position int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Categories viewable by everyone" ON public.categories;
CREATE POLICY "Categories viewable by everyone" ON public.categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS categories_set_updated_at ON public.categories;
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$ BEGIN
  CREATE TYPE public.product_status AS ENUM ('draft','pending_review','active','rejected','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  short_description text,
  category_slug text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  compare_at_price numeric(10,2),
  cost numeric(10,2),
  sku text,
  inventory_quantity int NOT NULL DEFAULT 0,
  track_inventory boolean NOT NULL DEFAULT true,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  supplier_source text,
  supplier_product_id text,
  supplier_url text,
  status public.product_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_vendor_idx ON public.products (vendor_id);
CREATE INDEX IF NOT EXISTS products_status_idx ON public.products (status);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products (category_slug);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active products viewable by everyone" ON public.products;
CREATE POLICY "Active products viewable by everyone" ON public.products FOR SELECT USING (status = 'active');
DROP POLICY IF EXISTS "Vendors view own products" ON public.products;
CREATE POLICY "Vendors view own products" ON public.products FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = products.vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Vendors insert own products" ON public.products;
CREATE POLICY "Vendors insert own products" ON public.products FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = products.vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Vendors update own products" ON public.products;
CREATE POLICY "Vendors update own products" ON public.products FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = products.vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Vendors delete own products" ON public.products;
CREATE POLICY "Vendors delete own products" ON public.products FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = products.vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products" ON public.products FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$ BEGIN CREATE TYPE public.order_status AS ENUM ('pending','processing','shipped','delivered','cancelled','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_status AS ENUM ('unpaid','paid','refunded','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.fulfillment_status AS ENUM ('pending','processing','shipped','delivered','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('1LV-' || lpad((floor(random()*900000)+100000)::text, 6, '0')),
  customer_id uuid NOT NULL,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  shipping_total numeric(10,2) NOT NULL DEFAULT 0,
  tax_total numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CAD',
  status public.order_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  shipping_address jsonb,
  billing_address jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders (customer_id);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers view own orders" ON public.orders;
CREATE POLICY "Customers view own orders" ON public.orders FOR SELECT USING (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Customers create own orders" ON public.orders;
CREATE POLICY "Customers create own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Admins manage orders" ON public.orders;
CREATE POLICY "Admins manage orders" ON public.orders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  title text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  status public.fulfillment_status NOT NULL DEFAULT 'pending',
  tracking_number text,
  carrier text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_vendor_idx ON public.order_items (vendor_id);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers view own order items" ON public.order_items;
CREATE POLICY "Customers view own order items" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()));
DROP POLICY IF EXISTS "Vendors view own order items" ON public.order_items;
CREATE POLICY "Vendors view own order items" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = order_items.vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Vendors update own order items" ON public.order_items;
CREATE POLICY "Vendors update own order items" ON public.order_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = order_items.vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Customers create own order items" ON public.order_items;
CREATE POLICY "Customers create own order items" ON public.order_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()));
DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;
CREATE POLICY "Admins manage order items" ON public.order_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS order_items_set_updated_at ON public.order_items;
CREATE TRIGGER order_items_set_updated_at BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP POLICY IF EXISTS "Vendors view related orders" ON public.orders;
CREATE POLICY "Vendors view related orders" ON public.orders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.vendors v ON v.id = oi.vendor_id
    WHERE oi.order_id = orders.id AND v.user_id = auth.uid()
  ));
