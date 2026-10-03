-- Parcel-level shipping, SLA and carrier-event engine.
-- 1LV owns fulfillment state. Carrier events are append-only and shipment
-- allocation is quantity-aware for multi-parcel vendor orders.

CREATE TYPE public.shipment_status AS ENUM (
  'preparing',
  'label_ready',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
  'cancelled'
);

CREATE TABLE public.vendor_shipping_profiles (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  handling_days integer NOT NULL DEFAULT 2 CHECK (handling_days BETWEEN 0 AND 30),
  transit_min_days integer NOT NULL DEFAULT 2 CHECK (transit_min_days BETWEEN 0 AND 60),
  transit_max_days integer NOT NULL DEFAULT 7 CHECK (transit_max_days BETWEEN 0 AND 90),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_shipping_profiles_transit_order
    CHECK (transit_max_days >= transit_min_days)
);

CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  status public.shipment_status NOT NULL DEFAULT 'preparing',
  carrier text,
  service_name text,
  tracking_number text,
  tracking_url text,
  label_url text,
  weight_grams integer,
  promised_ship_at timestamptz,
  estimated_delivery_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  last_event_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipments_carrier_length CHECK (
    carrier IS NULL OR length(carrier) BETWEEN 1 AND 120
  ),
  CONSTRAINT shipments_service_length CHECK (
    service_name IS NULL OR length(service_name) BETWEEN 1 AND 120
  ),
  CONSTRAINT shipments_tracking_length CHECK (
    tracking_number IS NULL OR length(tracking_number) BETWEEN 1 AND 160
  ),
  CONSTRAINT shipments_tracking_url_length CHECK (
    tracking_url IS NULL OR length(tracking_url) <= 2048
  ),
  CONSTRAINT shipments_label_url_length CHECK (
    label_url IS NULL OR length(label_url) <= 2048
  ),
  CONSTRAINT shipments_weight_nonnegative CHECK (
    weight_grams IS NULL OR weight_grams >= 0
  )
);

CREATE TABLE public.shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipment_items_shipment_item_unique
    UNIQUE (shipment_id, order_item_id)
);

CREATE TABLE public.shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  event_key text UNIQUE,
  status public.shipment_status NOT NULL,
  carrier_status text,
  location text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipment_events_key_length CHECK (
    event_key IS NULL OR length(event_key) BETWEEN 1 AND 200
  ),
  CONSTRAINT shipment_events_carrier_status_length CHECK (
    carrier_status IS NULL OR length(carrier_status) <= 200
  ),
  CONSTRAINT shipment_events_location_length CHECK (
    location IS NULL OR length(location) <= 300
  ),
  CONSTRAINT shipment_events_message_length CHECK (
    message IS NULL OR length(message) <= 2000
  ),
  CONSTRAINT shipment_events_metadata_size CHECK (
    octet_length(metadata::text) <= 32768
  )
);

CREATE INDEX shipments_order_idx
ON public.shipments (order_id, created_at, id);

CREATE INDEX shipments_vendor_order_idx
ON public.shipments (vendor_order_id, created_at, id);

CREATE INDEX shipments_vendor_status_idx
ON public.shipments (vendor_id, status, created_at DESC);

CREATE UNIQUE INDEX shipments_tracking_unique
ON public.shipments (lower(carrier), tracking_number)
WHERE carrier IS NOT NULL
  AND tracking_number IS NOT NULL
  AND status <> 'cancelled'::public.shipment_status;

CREATE INDEX shipment_items_order_item_idx
ON public.shipment_items (order_item_id);

CREATE INDEX shipment_events_timeline_idx
ON public.shipment_events (shipment_id, occurred_at, id);

ALTER TABLE public.vendor_shipping_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.vendor_shipping_profiles
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.shipments
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.shipment_items
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE POLICY "TAKATAK authenticated sessions only"
ON public.shipment_events
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

REVOKE ALL ON TABLE public.vendor_shipping_profiles
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shipments
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shipment_items
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shipment_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.vendor_shipping_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.shipments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.shipment_items TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.shipment_events FROM service_role;
GRANT SELECT, INSERT
ON TABLE public.shipment_events TO service_role;

CREATE OR REPLACE FUNCTION public.require_vendor_order_shipping_authority(
  _vendor_order_id uuid
)
RETURNS public.vendor_orders
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_vendor_order public.vendor_orders%ROWTYPE;
  v_owner uuid;
  v_payment_status text;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK vendor session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT vo.*
  INTO v_vendor_order
  FROM public.vendor_orders AS vo
  WHERE vo.id = _vendor_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor order not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT v.user_id, o.payment_status::text
  INTO v_owner, v_payment_status
  FROM public.vendors AS v
  JOIN public.orders AS o ON o.id = v_vendor_order.order_id
  WHERE v.id = v_vendor_order.vendor_id;

  IF v_owner <> v_user_id
     AND NOT public.has_role(v_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Vendor shipping access denied'
      USING ERRCODE = '42501';
  END IF;

  IF v_payment_status NOT IN ('paid', 'partially_refunded') THEN
    RAISE EXCEPTION 'Shipping requires a retained paid order'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_vendor_order;
END;
$$;

REVOKE ALL ON FUNCTION public.require_vendor_order_shipping_authority(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_vendor_order_shipping_authority(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_vendor_shipping_profile(
  _vendor_id uuid,
  _handling_days integer,
  _transit_min_days integer,
  _transit_max_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK vendor session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner
  FROM public.vendors
  WHERE id = _vendor_id;

  IF v_owner IS NULL
     OR (
       v_owner <> v_user_id
       AND NOT public.has_role(v_user_id, 'admin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Vendor shipping profile access denied'
      USING ERRCODE = '42501';
  END IF;

  IF _handling_days NOT BETWEEN 0 AND 30
     OR _transit_min_days NOT BETWEEN 0 AND 60
     OR _transit_max_days NOT BETWEEN _transit_min_days AND 90 THEN
    RAISE EXCEPTION 'Invalid shipping SLA values'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.vendor_shipping_profiles (
    vendor_id,
    handling_days,
    transit_min_days,
    transit_max_days
  )
  VALUES (
    _vendor_id,
    _handling_days,
    _transit_min_days,
    _transit_max_days
  )
  ON CONFLICT (vendor_id) DO UPDATE
  SET
    handling_days = EXCLUDED.handling_days,
    transit_min_days = EXCLUDED.transit_min_days,
    transit_max_days = EXCLUDED.transit_max_days,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'vendor_id', _vendor_id,
    'handling_days', _handling_days,
    'transit_min_days', _transit_min_days,
    'transit_max_days', _transit_max_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_vendor_shipping_profile(
  uuid, integer, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_vendor_shipping_profile(
  uuid, integer, integer, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_fulfillment_from_shipments(
  _vendor_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor_order public.vendor_orders%ROWTYPE;
  v_item record;
  v_shipped_quantity integer;
  v_delivered_quantity integer;
  v_all_shipped boolean := true;
  v_all_delivered boolean := true;
  v_any_shipment boolean := false;
  v_all_vendor_orders_delivered boolean := false;
  v_all_vendor_orders_shipped boolean := false;
  v_vendor_status public.vendor_order_status;
BEGIN
  SELECT *
  INTO v_vendor_order
  FROM public.vendor_orders
  WHERE id = _vendor_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor order not found'
      USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.quantity
    FROM public.order_items AS oi
    WHERE oi.order_id = v_vendor_order.order_id
      AND oi.vendor_id = v_vendor_order.vendor_id
    ORDER BY oi.id
    FOR UPDATE
  LOOP
    SELECT
      COALESCE(sum(si.quantity) FILTER (
        WHERE s.status IN (
          'shipped'::public.shipment_status,
          'in_transit'::public.shipment_status,
          'out_for_delivery'::public.shipment_status,
          'delivered'::public.shipment_status,
          'exception'::public.shipment_status,
          'returned'::public.shipment_status
        )
      ), 0)::integer,
      COALESCE(sum(si.quantity) FILTER (
        WHERE s.status = 'delivered'::public.shipment_status
      ), 0)::integer
    INTO v_shipped_quantity, v_delivered_quantity
    FROM public.shipment_items AS si
    JOIN public.shipments AS s ON s.id = si.shipment_id
    WHERE si.order_item_id = v_item.id
      AND s.vendor_order_id = v_vendor_order.id
      AND s.status <> 'cancelled'::public.shipment_status;

    IF v_shipped_quantity > 0 THEN
      v_any_shipment := true;
    END IF;
    IF v_shipped_quantity < v_item.quantity THEN
      v_all_shipped := false;
    END IF;
    IF v_delivered_quantity < v_item.quantity THEN
      v_all_delivered := false;
    END IF;

    UPDATE public.order_items
    SET
      status = CASE
        WHEN v_delivered_quantity >= v_item.quantity
          THEN 'delivered'::public.fulfillment_status
        WHEN v_shipped_quantity >= v_item.quantity
          THEN 'shipped'::public.fulfillment_status
        WHEN v_shipped_quantity > 0
          THEN 'processing'::public.fulfillment_status
        ELSE status
      END,
      updated_at = now()
    WHERE id = v_item.id;
  END LOOP;

  v_vendor_status := CASE
    WHEN v_all_delivered AND v_any_shipment
      THEN 'delivered'::public.vendor_order_status
    WHEN v_all_shipped AND v_any_shipment
      THEN 'shipped'::public.vendor_order_status
    ELSE 'processing'::public.vendor_order_status
  END;

  UPDATE public.vendor_orders
  SET
    status = v_vendor_status,
    tracking_number = CASE
      WHEN (
        SELECT count(*)
        FROM public.shipments
        WHERE vendor_order_id = v_vendor_order.id
          AND status <> 'cancelled'::public.shipment_status
      ) = 1
      THEN (
        SELECT tracking_number
        FROM public.shipments
        WHERE vendor_order_id = v_vendor_order.id
          AND status <> 'cancelled'::public.shipment_status
        LIMIT 1
      )
      ELSE NULL
    END,
    carrier = CASE
      WHEN (
        SELECT count(*)
        FROM public.shipments
        WHERE vendor_order_id = v_vendor_order.id
          AND status <> 'cancelled'::public.shipment_status
      ) = 1
      THEN (
        SELECT carrier
        FROM public.shipments
        WHERE vendor_order_id = v_vendor_order.id
          AND status <> 'cancelled'::public.shipment_status
        LIMIT 1
      )
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = v_vendor_order.id;

  SELECT
    bool_and(status = 'delivered'::public.vendor_order_status),
    bool_and(
      status IN (
        'shipped'::public.vendor_order_status,
        'delivered'::public.vendor_order_status
      )
    )
  INTO v_all_vendor_orders_delivered, v_all_vendor_orders_shipped
  FROM public.vendor_orders
  WHERE order_id = v_vendor_order.order_id;

  UPDATE public.orders
  SET
    status = CASE
      WHEN COALESCE(v_all_vendor_orders_delivered, false)
        THEN 'delivered'::public.order_status
      WHEN COALESCE(v_all_vendor_orders_shipped, false)
        THEN 'shipped'::public.order_status
      ELSE 'processing'::public.order_status
    END,
    updated_at = now()
  WHERE id = v_vendor_order.order_id
    AND payment_status::text IN ('paid', 'partially_refunded');

  RETURN jsonb_build_object(
    'ok', true,
    'vendor_order_id', v_vendor_order.id,
    'vendor_order_status', v_vendor_status::text,
    'order_id', v_vendor_order.order_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_fulfillment_from_shipments(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_fulfillment_from_shipments(uuid)
TO service_role;

CREATE OR REPLACE FUNCTION public.create_vendor_shipment(
  _vendor_order_id uuid,
  _items jsonb,
  _carrier text DEFAULT NULL,
  _service_name text DEFAULT NULL,
  _tracking_number text DEFAULT NULL,
  _tracking_url text DEFAULT NULL,
  _label_url text DEFAULT NULL,
  _weight_grams integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor_order public.vendor_orders%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_profile public.vendor_shipping_profiles%ROWTYPE;
  v_shipment_id uuid;
  v_status public.shipment_status;
  v_item record;
  v_order_item public.order_items%ROWTYPE;
  v_allocated integer;
  v_carrier text := NULLIF(btrim(COALESCE(_carrier, '')), '');
  v_service text := NULLIF(btrim(COALESCE(_service_name, '')), '');
  v_tracking text := NULLIF(btrim(COALESCE(_tracking_number, '')), '');
  v_tracking_url text := NULLIF(btrim(COALESCE(_tracking_url, '')), '');
  v_label_url text := NULLIF(btrim(COALESCE(_label_url, '')), '');
  v_promised_ship_at timestamptz;
  v_estimated_delivery_at timestamptz;
BEGIN
  v_vendor_order := public.require_vendor_order_shipping_authority(
    _vendor_order_id
  );

  IF v_vendor_order.status IN (
    'delivered'::public.vendor_order_status,
    'cancelled'::public.vendor_order_status
  ) THEN
    RAISE EXCEPTION 'Vendor order cannot accept new shipments'
      USING ERRCODE = '22023';
  END IF;

  IF _items IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Shipment must contain between 1 and 100 order items'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_items) AS entry
    WHERE COALESCE(entry->>'order_item_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(entry->>'quantity', '') !~ '^[1-9][0-9]?$'
  ) THEN
    RAISE EXCEPTION 'Each shipment item requires a valid order item and quantity'
      USING ERRCODE = '22023';
  END IF;

  IF (v_carrier IS NOT NULL AND length(v_carrier) > 120)
     OR (v_service IS NOT NULL AND length(v_service) > 120)
     OR (v_tracking IS NOT NULL AND length(v_tracking) > 160)
     OR (v_tracking_url IS NOT NULL AND length(v_tracking_url) > 2048)
     OR (v_label_url IS NOT NULL AND length(v_label_url) > 2048)
     OR (_weight_grams IS NOT NULL AND _weight_grams < 0) THEN
    RAISE EXCEPTION 'Invalid shipment metadata'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.vendor_shipping_profiles
  WHERE vendor_id = v_vendor_order.vendor_id;

  IF NOT FOUND THEN
    v_profile.handling_days := 2;
    v_profile.transit_min_days := 2;
    v_profile.transit_max_days := 7;
  END IF;

  v_promised_ship_at := now() + make_interval(days => v_profile.handling_days);
  v_estimated_delivery_at :=
    v_promised_ship_at + make_interval(days => v_profile.transit_max_days);

  FOR v_item IN
    SELECT
      (entry->>'order_item_id')::uuid AS order_item_id,
      sum((entry->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(_items) AS entry
    GROUP BY (entry->>'order_item_id')::uuid
    ORDER BY (entry->>'order_item_id')::uuid
  LOOP
    SELECT *
    INTO v_order_item
    FROM public.order_items
    WHERE id = v_item.order_item_id
      AND order_id = v_vendor_order.order_id
      AND vendor_id = v_vendor_order.vendor_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shipment item does not belong to this vendor order'
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(sum(si.quantity), 0)::integer
    INTO v_allocated
    FROM public.shipment_items AS si
    JOIN public.shipments AS s ON s.id = si.shipment_id
    WHERE si.order_item_id = v_order_item.id
      AND s.status <> 'cancelled'::public.shipment_status;

    IF v_allocated + v_item.quantity > v_order_item.quantity THEN
      RAISE EXCEPTION 'Shipment quantity exceeds unallocated order quantity'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_status := CASE
    WHEN v_tracking IS NOT NULL OR v_label_url IS NOT NULL
      THEN 'label_ready'::public.shipment_status
    ELSE 'preparing'::public.shipment_status
  END;

  INSERT INTO public.shipments (
    order_id,
    vendor_order_id,
    vendor_id,
    status,
    carrier,
    service_name,
    tracking_number,
    tracking_url,
    label_url,
    weight_grams,
    promised_ship_at,
    estimated_delivery_at,
    created_by
  )
  VALUES (
    v_vendor_order.order_id,
    v_vendor_order.id,
    v_vendor_order.vendor_id,
    v_status,
    v_carrier,
    v_service,
    v_tracking,
    v_tracking_url,
    v_label_url,
    _weight_grams,
    v_promised_ship_at,
    v_estimated_delivery_at,
    v_user_id
  )
  RETURNING id INTO v_shipment_id;

  INSERT INTO public.shipment_items (
    shipment_id,
    order_item_id,
    quantity
  )
  SELECT
    v_shipment_id,
    (entry->>'order_item_id')::uuid,
    sum((entry->>'quantity')::integer)::integer
  FROM jsonb_array_elements(_items) AS entry
  GROUP BY (entry->>'order_item_id')::uuid;

  INSERT INTO public.shipment_events (
    shipment_id,
    event_key,
    status,
    message,
    occurred_at,
    metadata
  )
  VALUES (
    v_shipment_id,
    'created:' || v_shipment_id::text,
    v_status,
    'Shipment created',
    now(),
    jsonb_build_object('source', 'vendor')
  );

  UPDATE public.vendor_orders
  SET
    status = CASE
      WHEN status IN (
        'pending'::public.vendor_order_status,
        'accepted'::public.vendor_order_status
      ) THEN 'processing'::public.vendor_order_status
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_vendor_order.id;

  RETURN jsonb_build_object(
    'ok', true,
    'shipment_id', v_shipment_id,
    'vendor_order_id', v_vendor_order.id,
    'status', v_status::text,
    'promised_ship_at', v_promised_ship_at,
    'estimated_delivery_at', v_estimated_delivery_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_vendor_shipment(
  uuid, jsonb, text, text, text, text, text, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vendor_shipment(
  uuid, jsonb, text, text, text, text, text, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_vendor_shipment_shipped(
  _shipment_id uuid,
  _carrier text,
  _tracking_number text,
  _service_name text DEFAULT NULL,
  _tracking_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shipment public.shipments%ROWTYPE;
  v_vendor_order public.vendor_orders%ROWTYPE;
  v_carrier text := NULLIF(btrim(COALESCE(_carrier, '')), '');
  v_tracking text := NULLIF(btrim(COALESCE(_tracking_number, '')), '');
  v_service text := NULLIF(btrim(COALESCE(_service_name, '')), '');
  v_tracking_url text := NULLIF(btrim(COALESCE(_tracking_url, '')), '');
BEGIN
  SELECT *
  INTO v_shipment
  FROM public.shipments
  WHERE id = _shipment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment not found'
      USING ERRCODE = 'P0002';
  END IF;

  v_vendor_order := public.require_vendor_order_shipping_authority(
    v_shipment.vendor_order_id
  );

  IF v_shipment.status IN (
    'delivered'::public.shipment_status,
    'returned'::public.shipment_status,
    'cancelled'::public.shipment_status
  ) THEN
    RAISE EXCEPTION 'Shipment can no longer be marked shipped'
      USING ERRCODE = '22023';
  END IF;

  IF v_carrier IS NULL OR v_tracking IS NULL THEN
    RAISE EXCEPTION 'Carrier and tracking number are required'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_carrier) > 120 OR length(v_tracking) > 160
     OR (v_service IS NOT NULL AND length(v_service) > 120)
     OR (v_tracking_url IS NOT NULL AND length(v_tracking_url) > 2048) THEN
    RAISE EXCEPTION 'Invalid shipment tracking metadata'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.shipments
  SET
    status = 'shipped'::public.shipment_status,
    carrier = v_carrier,
    tracking_number = v_tracking,
    service_name = COALESCE(v_service, service_name),
    tracking_url = COALESCE(v_tracking_url, tracking_url),
    shipped_at = COALESCE(shipped_at, now()),
    last_event_at = GREATEST(COALESCE(last_event_at, '-infinity'::timestamptz), now()),
    updated_at = now()
  WHERE id = v_shipment.id;

  INSERT INTO public.shipment_events (
    shipment_id,
    event_key,
    status,
    carrier_status,
    message,
    occurred_at,
    metadata
  )
  VALUES (
    v_shipment.id,
    'vendor-shipped:' || v_shipment.id::text,
    'shipped'::public.shipment_status,
    'shipped',
    'Shipment handed to carrier',
    now(),
    jsonb_build_object('source', 'vendor')
  )
  ON CONFLICT (event_key) DO NOTHING;

  PERFORM public.refresh_fulfillment_from_shipments(
    v_shipment.vendor_order_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'shipment_id', v_shipment.id,
    'status', 'shipped',
    'carrier', v_carrier,
    'tracking_number', v_tracking
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_vendor_shipment_shipped(
  uuid, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_vendor_shipment_shipped(
  uuid, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.ingest_shipment_event(
  _shipment_id uuid,
  _event_key text,
  _status public.shipment_status,
  _occurred_at timestamptz,
  _carrier_status text DEFAULT NULL,
  _location text DEFAULT NULL,
  _message text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shipment public.shipments%ROWTYPE;
  v_event_key text := NULLIF(btrim(COALESCE(_event_key, '')), '');
  v_existing_event_id uuid;
  v_current_rank integer;
  v_next_rank integer;
  v_effective_status public.shipment_status;
BEGIN
  IF _shipment_id IS NULL OR _status IS NULL OR _occurred_at IS NULL
     OR v_event_key IS NULL OR length(v_event_key) > 200 THEN
    RAISE EXCEPTION 'Shipment event identity, status and timestamp are required'
      USING ERRCODE = '22023';
  END IF;

  IF _metadata IS NULL OR jsonb_typeof(_metadata) <> 'object'
     OR octet_length(_metadata::text) > 32768 THEN
    RAISE EXCEPTION 'Invalid shipment event metadata'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing_event_id
  FROM public.shipment_events
  WHERE event_key = v_event_key;

  IF v_existing_event_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reused', true,
      'shipment_event_id', v_existing_event_id,
      'shipment_id', _shipment_id
    );
  END IF;

  SELECT *
  INTO v_shipment
  FROM public.shipments
  WHERE id = _shipment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment not found'
      USING ERRCODE = 'P0002';
  END IF;

  v_current_rank := CASE v_shipment.status
    WHEN 'preparing' THEN 10
    WHEN 'label_ready' THEN 20
    WHEN 'shipped' THEN 30
    WHEN 'in_transit' THEN 40
    WHEN 'out_for_delivery' THEN 50
    WHEN 'exception' THEN 55
    WHEN 'delivered' THEN 60
    WHEN 'returned' THEN 70
    WHEN 'cancelled' THEN 80
  END;

  v_next_rank := CASE _status
    WHEN 'preparing' THEN 10
    WHEN 'label_ready' THEN 20
    WHEN 'shipped' THEN 30
    WHEN 'in_transit' THEN 40
    WHEN 'out_for_delivery' THEN 50
    WHEN 'exception' THEN 55
    WHEN 'delivered' THEN 60
    WHEN 'returned' THEN 70
    WHEN 'cancelled' THEN 80
  END;

  v_effective_status := v_shipment.status;

  IF _status IN (
    'exception'::public.shipment_status,
    'returned'::public.shipment_status
  ) OR v_next_rank >= v_current_rank THEN
    v_effective_status := _status;
  END IF;

  INSERT INTO public.shipment_events (
    shipment_id,
    event_key,
    status,
    carrier_status,
    location,
    message,
    metadata,
    occurred_at
  )
  VALUES (
    _shipment_id,
    v_event_key,
    _status,
    NULLIF(btrim(COALESCE(_carrier_status, '')), ''),
    NULLIF(btrim(COALESCE(_location, '')), ''),
    NULLIF(btrim(COALESCE(_message, '')), ''),
    _metadata,
    _occurred_at
  )
  RETURNING id INTO v_existing_event_id;

  UPDATE public.shipments
  SET
    status = v_effective_status,
    shipped_at = CASE
      WHEN v_effective_status IN (
        'shipped'::public.shipment_status,
        'in_transit'::public.shipment_status,
        'out_for_delivery'::public.shipment_status,
        'delivered'::public.shipment_status,
        'exception'::public.shipment_status,
        'returned'::public.shipment_status
      ) THEN COALESCE(shipped_at, _occurred_at)
      ELSE shipped_at
    END,
    delivered_at = CASE
      WHEN v_effective_status = 'delivered'::public.shipment_status
        THEN COALESCE(delivered_at, _occurred_at)
      ELSE delivered_at
    END,
    last_event_at = GREATEST(
      COALESCE(last_event_at, '-infinity'::timestamptz),
      _occurred_at
    ),
    updated_at = now()
  WHERE id = _shipment_id;

  PERFORM public.refresh_fulfillment_from_shipments(
    v_shipment.vendor_order_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reused', false,
    'shipment_event_id', v_existing_event_id,
    'shipment_id', _shipment_id,
    'shipment_status', v_effective_status::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_shipment_event(
  uuid, text, public.shipment_status, timestamptz, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_shipment_event(
  uuid, text, public.shipment_status, timestamptz, text, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_order_shipments(
  _order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
  v_is_vendor boolean := false;
  v_is_admin boolean := false;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_takatak_authorized_session() THEN
    RAISE EXCEPTION 'Authorized TAKATAK session required'
      USING ERRCODE = '42501';
  END IF;

  SELECT customer_id
  INTO v_customer_id
  FROM public.orders
  WHERE id = _order_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.vendor_orders AS vo
    JOIN public.vendors AS v ON v.id = vo.vendor_id
    WHERE vo.order_id = _order_id
      AND v.user_id = v_user_id
  )
  INTO v_is_vendor;

  v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);

  IF v_customer_id IS DISTINCT FROM v_user_id
     AND NOT v_is_vendor
     AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Shipment access denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'vendor_order_id', s.vendor_order_id,
        'vendor_id', s.vendor_id,
        'status', s.status::text,
        'carrier', s.carrier,
        'service_name', s.service_name,
        'tracking_number', s.tracking_number,
        'tracking_url', s.tracking_url,
        'promised_ship_at', s.promised_ship_at,
        'estimated_delivery_at', s.estimated_delivery_at,
        'shipped_at', s.shipped_at,
        'delivered_at', s.delivered_at,
        'items', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'order_item_id', si.order_item_id,
              'quantity', si.quantity,
              'title', oi.title,
              'variant_id', oi.variant_id,
              'variant_sku', oi.variant_sku,
              'variant_options', oi.variant_options
            )
            ORDER BY si.created_at, si.id
          )
          FROM public.shipment_items AS si
          JOIN public.order_items AS oi ON oi.id = si.order_item_id
          WHERE si.shipment_id = s.id
        ), '[]'::jsonb),
        'events', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'status', se.status::text,
              'carrier_status', se.carrier_status,
              'location', se.location,
              'message', se.message,
              'occurred_at', se.occurred_at
            )
            ORDER BY se.occurred_at, se.id
          )
          FROM public.shipment_events AS se
          WHERE se.shipment_id = s.id
        ), '[]'::jsonb)
      )
      ORDER BY s.created_at, s.id
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.shipments AS s
  WHERE s.order_id = _order_id
    AND (
      v_is_admin
      OR v_customer_id = v_user_id
      OR EXISTS (
        SELECT 1
        FROM public.vendors AS v
        WHERE v.id = s.vendor_id
          AND v.user_id = v_user_id
      )
    );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_shipments(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_shipments(uuid)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_vendor_shipments(
  _vendor_id uuid,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  vendor_order_id uuid,
  status public.shipment_status,
  carrier text,
  service_name text,
  tracking_number text,
  promised_ship_at timestamptz,
  estimated_delivery_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL
     OR NOT public.is_takatak_authorized_session()
     OR NOT EXISTS (
       SELECT 1
       FROM public.vendors AS v
       WHERE v.id = _vendor_id
         AND (
           v.user_id = v_user_id
           OR public.has_role(v_user_id, 'admin'::public.app_role)
         )
     ) THEN
    RAISE EXCEPTION 'Vendor shipment access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.order_id,
    s.vendor_order_id,
    s.status,
    s.carrier,
    s.service_name,
    s.tracking_number,
    s.promised_ship_at,
    s.estimated_delivery_at,
    s.shipped_at,
    s.delivered_at,
    s.created_at
  FROM public.shipments AS s
  WHERE s.vendor_id = _vendor_id
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.list_vendor_shipments(uuid, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_vendor_shipments(uuid, integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT '20261003041000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
