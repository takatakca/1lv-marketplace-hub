begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

select ok(
  to_regtype('public.shipment_status') is not null,
  'shipment lifecycle enum exists'
);

select ok(
  to_regclass('public.vendor_shipping_profiles') is not null
  and to_regclass('public.shipments') is not null
  and to_regclass('public.shipment_items') is not null
  and to_regclass('public.shipment_events') is not null,
  'parcel shipping and SLA tables exist'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'vendor_shipping_profiles',
        'shipments',
        'shipment_items',
        'shipment_events'
      )
      and policyname = 'TAKATAK authenticated sessions only'
      and permissive = 'RESTRICTIVE'
  ),
  4,
  'every shipping table has the restrictive TAKATAK session gate'
);

select ok(
  not has_table_privilege('authenticated', 'public.shipments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.shipments', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.shipments', 'DELETE'),
  'browser users cannot bypass shipment RPC authority'
);

select ok(
  not has_table_privilege('service_role', 'public.shipment_events', 'UPDATE')
  and not has_table_privilege('service_role', 'public.shipment_events', 'DELETE'),
  'carrier event history is append-only'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'shipments_tracking_unique'
  ),
  'active carrier tracking identity is unique'
);

select ok(
  to_regprocedure(
    'public.upsert_vendor_shipping_profile(uuid,integer,integer,integer)'
  ) is not null,
  'vendor SLA profile RPC exists'
);

select ok(
  position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.upsert_vendor_shipping_profile(uuid,integer,integer,integer)'::regprocedure
    )
  ) > 0,
  'shipping profile mutation requires TAKATAK authorization'
);

select ok(
  position(
    'Invalid shipping SLA values'
    in pg_get_functiondef(
      'public.upsert_vendor_shipping_profile(uuid,integer,integer,integer)'::regprocedure
    )
  ) > 0,
  'shipping profile validates SLA bounds'
);

select ok(
  to_regprocedure(
    'public.create_vendor_shipment(uuid,jsonb,text,text,text,text,text,integer)'
  ) is not null,
  'vendor parcel creation RPC exists'
);

select ok(
  position(
    'Shipment quantity exceeds unallocated order quantity'
    in pg_get_functiondef(
      'public.create_vendor_shipment(uuid,jsonb,text,text,text,text,text,integer)'::regprocedure
    )
  ) > 0,
  'parcel allocation cannot exceed purchased quantity'
);

select ok(
  position(
    'Shipment item does not belong to this vendor order'
    in pg_get_functiondef(
      'public.create_vendor_shipment(uuid,jsonb,text,text,text,text,text,integer)'::regprocedure
    )
  ) > 0,
  'parcel items are vendor-order scoped'
);

select ok(
  position(
    'make_interval(days => v_profile.handling_days)'
    in pg_get_functiondef(
      'public.create_vendor_shipment(uuid,jsonb,text,text,text,text,text,integer)'::regprocedure
    )
  ) > 0,
  'parcel promise date is derived from vendor handling SLA'
);

select ok(
  to_regprocedure(
    'public.mark_vendor_shipment_shipped(uuid,text,text,text,text)'
  ) is not null,
  'vendor shipment handoff RPC exists'
);

select ok(
  position(
    'Carrier and tracking number are required'
    in pg_get_functiondef(
      'public.mark_vendor_shipment_shipped(uuid,text,text,text,text)'::regprocedure
    )
  ) > 0,
  'carrier handoff requires real tracking identity'
);

select ok(
  to_regprocedure(
    'public.ingest_shipment_event(uuid,text,public.shipment_status,timestamp with time zone,text,text,text,jsonb)'
  ) is not null,
  'service-role carrier event ingestion RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.ingest_shipment_event(uuid,text,public.shipment_status,timestamp with time zone,text,text,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.ingest_shipment_event(uuid,text,public.shipment_status,timestamp with time zone,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'carrier event ingestion is service-role only'
);

select ok(
  position(
    'WHERE event_key = v_event_key'
    in pg_get_functiondef(
      'public.ingest_shipment_event(uuid,text,public.shipment_status,timestamp with time zone,text,text,text,jsonb)'::regprocedure
    )
  ) > 0
  and position(
    '''reused'', true'
    in pg_get_functiondef(
      'public.ingest_shipment_event(uuid,text,public.shipment_status,timestamp with time zone,text,text,text,jsonb)'::regprocedure
    )
  ) > 0,
  'carrier events are idempotent by external event key'
);

select ok(
  to_regprocedure('public.refresh_fulfillment_from_shipments(uuid)') is not null,
  'shipment aggregation RPC exists'
);

select ok(
  position(
    'v_delivered_quantity >= v_item.quantity'
    in pg_get_functiondef(
      'public.refresh_fulfillment_from_shipments(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'v_shipped_quantity >= v_item.quantity'
    in pg_get_functiondef(
      'public.refresh_fulfillment_from_shipments(uuid)'::regprocedure
    )
  ) > 0,
  'item fulfillment is quantity-aware across multiple parcels'
);

select ok(
  position(
    'bool_and(status = ''delivered''::public.vendor_order_status)'
    in pg_get_functiondef(
      'public.refresh_fulfillment_from_shipments(uuid)'::regprocedure
    )
  ) > 0,
  'parcel state rolls up into whole-order fulfillment'
);

select ok(
  to_regprocedure('public.get_order_shipments(uuid)') is not null
  and not has_function_privilege(
    'anon',
    'public.get_order_shipments(uuid)',
    'EXECUTE'
  ),
  'order shipment timeline is authenticated-only'
);

select ok(
  position(
    'v_customer_id IS DISTINCT FROM v_user_id'
    in pg_get_functiondef(
      'public.get_order_shipments(uuid)'::regprocedure
    )
  ) > 0,
  'shipment timeline checks customer/vendor/admin ownership'
);

select ok(
  to_regprocedure('public.list_vendor_shipments(uuid,integer)') is not null
  and not has_function_privilege(
    'anon',
    'public.list_vendor_shipments(uuid,integer)',
    'EXECUTE'
  ),
  'vendor shipment queue is protected'
);

select ok(
  public.get_1lv_schema_version() >= '20261003041000',
  'shipping engine is present in the current production schema'
);

select * from finish();

rollback;
