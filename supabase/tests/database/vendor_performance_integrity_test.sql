begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select ok(
  to_regprocedure(
    'public.get_vendor_performance_dashboard(uuid,integer)'
  ) is not null,
  'vendor performance dashboard RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_vendor_performance_dashboard(uuid,integer)',
    'EXECUTE'
  ),
  'vendor performance dashboard is not public'
);

select ok(
  position(
    'public.require_vendor_catalog_authority(_vendor_id)'
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'vendor performance dashboard checks vendor authority'
);

select ok(
  position(
    'paid''::public.payment_status'
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0
  and position(
    'partially_refunded''::public.payment_status'
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'financial analytics use retained paid commerce state'
);

select ok(
  position(
    '''gross_merchandise'''
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0
  and position(
    '''refunds'''
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'dashboard separates gross merchandise and refunds'
);

select ok(
  position(
    '''payouts_paid'''
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0
  and position(
    'status = ''paid''::public.payout_status'
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'dashboard distinguishes actually paid payouts'
);

select ok(
  position(
    '''on_time_ship_rate'''
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'dashboard calculates shipping SLA performance'
);

select ok(
  position(
    's.shipped_at <= s.promised_ship_at'
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'on-time shipment metric uses promised ship timestamp'
);

select ok(
  position(
    's.delivered_at <= s.estimated_delivery_at'
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'on-time delivery metric uses estimated delivery timestamp'
);

select ok(
  position(
    '''exceptions'''
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'dashboard exposes shipment exception count'
);

select ok(
  position(
    '''unit_return_rate'''
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'dashboard exposes returned-unit rate'
);

select ok(
  position(
    'rr.status NOT IN'
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'cancelled/rejected returns are excluded from returned-unit metrics'
);

select ok(
  to_regprocedure(
    'public.get_vendor_daily_sales(uuid,integer)'
  ) is not null,
  'vendor daily sales RPC exists'
);

select ok(
  position(
    'generate_series'
    in pg_get_functiondef(
      'public.get_vendor_daily_sales(uuid,integer)'::regprocedure
    )
  ) > 0,
  'daily series fills zero-sale calendar days server-side'
);

select ok(
  position(
    'vo.refund_amount'
    in pg_get_functiondef(
      'public.get_vendor_daily_sales(uuid,integer)'::regprocedure
    )
  ) > 0,
  'daily analytics carry refund totals separately'
);

select ok(
  to_regprocedure(
    'public.get_vendor_top_products(uuid,integer,integer)'
  ) is not null,
  'real top-products RPC exists'
);

select ok(
  position(
    'sum(oi.quantity)'
    in pg_get_functiondef(
      'public.get_vendor_top_products(uuid,integer,integer)'::regprocedure
    )
  ) > 0,
  'top products rank from actual order-item units'
);

select ok(
  position(
    'sum(oi.unit_price * oi.quantity)'
    in pg_get_functiondef(
      'public.get_vendor_top_products(uuid,integer,integer)'::regprocedure
    )
  ) > 0,
  'top products calculate actual gross merchandise'
);

select ok(
  position(
    'count(DISTINCT oi.order_id)'
    in pg_get_functiondef(
      'public.get_vendor_top_products(uuid,integer,integer)'::regprocedure
    )
  ) > 0,
  'top products expose real order count'
);

select ok(
  position(
    'LEAST(GREATEST(COALESCE(_days, 30), 1), 365)'
    in pg_get_functiondef(
      'public.get_vendor_performance_dashboard(uuid,integer)'::regprocedure
    )
  ) > 0,
  'performance dashboard time window is bounded'
);

select ok(
  position(
    'LEAST(GREATEST(COALESCE(_limit, 10), 1), 100)'
    in pg_get_functiondef(
      'public.get_vendor_top_products(uuid,integer,integer)'::regprocedure
    )
  ) > 0,
  'top-products result limit is bounded'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_vendor_performance_dashboard(uuid,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_vendor_daily_sales(uuid,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_vendor_top_products(uuid,integer,integer)',
    'EXECUTE'
  ),
  'authenticated vendors can call curated analytics RPCs'
);

select ok(
  public.get_1lv_schema_version() >= '20261003060000',
  'vendor performance analytics are present in current production schema'
);

select * from finish();

rollback;
