-- Persistent operational settings for 1LV.CA.
-- Admin writes only. Checkout reads trusted settings through service_role.

CREATE TABLE IF NOT EXISTS public.marketplace_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  marketplace_name text NOT NULL DEFAULT '1LV.CA',
  support_email text NOT NULL DEFAULT 'support@1lv.ca',
  default_commission_rate numeric(5,4) NOT NULL DEFAULT 0.10 CHECK (default_commission_rate >= 0 AND default_commission_rate <= 1),
  free_shipping_threshold numeric(12,2) NOT NULL DEFAULT 49 CHECK (free_shipping_threshold >= 0),
  standard_shipping_fee numeric(12,2) NOT NULL DEFAULT 7.99 CHECK (standard_shipping_fee >= 0),
  require_product_approval boolean NOT NULL DEFAULT true,
  require_vendor_approval boolean NOT NULL DEFAULT true,
  allow_guest_checkout boolean NOT NULL DEFAULT true,
  demo_mode boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.marketplace_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketplace_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.marketplace_settings TO authenticated;
GRANT ALL ON public.marketplace_settings TO service_role;

DROP POLICY IF EXISTS "Admins read marketplace settings" ON public.marketplace_settings;
CREATE POLICY "Admins read marketplace settings"
ON public.marketplace_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins update marketplace settings" ON public.marketplace_settings;
CREATE POLICY "Admins update marketplace settings"
ON public.marketplace_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.marketplace_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_version bigint NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_values jsonb NOT NULL,
  next_values jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_settings_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_settings_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketplace_settings_audit TO authenticated;
GRANT ALL ON public.marketplace_settings_audit TO service_role;

DROP POLICY IF EXISTS "Admins read marketplace settings audit" ON public.marketplace_settings_audit;
CREATE POLICY "Admins read marketplace settings audit"
ON public.marketplace_settings_audit FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.audit_marketplace_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();

  INSERT INTO public.marketplace_settings_audit (
    settings_version, changed_by, previous_values, next_values
  ) VALUES (
    NEW.version,
    auth.uid(),
    to_jsonb(OLD) - 'updated_by',
    to_jsonb(NEW) - 'updated_by'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_settings_audit_trigger ON public.marketplace_settings;
CREATE TRIGGER marketplace_settings_audit_trigger
BEFORE UPDATE ON public.marketplace_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_marketplace_settings();

CREATE OR REPLACE FUNCTION public.get_public_marketplace_settings()
RETURNS TABLE (
  marketplace_name text,
  support_email text,
  free_shipping_threshold numeric,
  standard_shipping_fee numeric,
  allow_guest_checkout boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    s.marketplace_name,
    s.support_email,
    s.free_shipping_threshold,
    s.standard_shipping_fee,
    s.allow_guest_checkout
  FROM public.marketplace_settings AS s
  WHERE s.id = true;
$$;

REVOKE ALL ON FUNCTION public.get_public_marketplace_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_marketplace_settings() TO anon, authenticated, service_role;
