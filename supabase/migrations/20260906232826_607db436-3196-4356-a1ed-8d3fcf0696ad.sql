ALTER TABLE public.takatak_outbox ADD COLUMN IF NOT EXISTS event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS takatak_outbox_event_key_uidx
  ON public.takatak_outbox (event_key)
  WHERE event_key IS NOT NULL;

-- Harden SECURITY DEFINER helpers: explicit search_path, schema-qualified bodies,
-- and least-privilege EXECUTE grants.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.owns_vendor(_vendor_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  select exists (select 1 from public.vendors v where v.id = _vendor_id and v.user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.can_access_dispute(_dispute_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  select exists (
    select 1 from public.disputes d
    where d.id = _dispute_id
      and (
        d.customer_id = _user_id
        or public.owns_vendor(d.vendor_id, _user_id)
        or public.has_role(_user_id, 'admin')
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_commission_rates(_vendor_ids uuid[])
RETURNS TABLE(id uuid, commission_rate numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT v.id, v.commission_rate
  FROM public.vendors v
  WHERE v.id = ANY(_vendor_ids);
$$;

CREATE OR REPLACE FUNCTION public.lookup_guest_order(_order_number text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.owns_vendor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_vendor(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_access_dispute(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_dispute(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_vendor_commission_rates(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vendor_commission_rates(uuid[]) TO authenticated, service_role;

-- Guest order lookup must stay reachable by signed-out shoppers tracking an order.
REVOKE ALL ON FUNCTION public.lookup_guest_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_guest_order(text) TO anon, authenticated, service_role;