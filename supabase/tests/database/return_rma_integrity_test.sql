begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

select ok(
  to_regtype('public.return_status') is not null
  and to_regtype('public.return_reason') is not null,
  'return lifecycle enums exist'
);

select ok(
  to_regclass('public.return_requests') is not null
  and to_regclass('public.return_items') is not null
  and to_regclass('public.return_events') is not null,
  'dedicated RMA tables exist'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'return_requests',
        'return_items',
        'return_events'
      )
      and policyname = 'TAKATAK authenticated sessions only'
      and permissive = 'RESTRICTIVE'
  ),
  3,
  'every RMA table carries the restrictive TAKATAK session gate'
);

select ok(
  not has_table_privilege('authenticated', 'public.return_requests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.return_requests', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.return_requests', 'DELETE'),
  'browser customers cannot bypass return RPC authority'
);

select ok(
  not has_table_privilege('authenticated', 'public.return_items', 'INSERT')
  and not has_table_privilege('authenticated', 'public.return_items', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.return_items', 'DELETE'),
  'browser customers cannot mutate return items directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.return_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.return_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.return_events', 'DELETE'),
  'return event history is not browser writable'
);

select ok(
  not has_table_privilege('service_role', 'public.return_events', 'UPDATE')
  and not has_table_privilege('service_role', 'public.return_events', 'DELETE'),
  'return event history is append-only even for service role privileges'
);

select ok(
  to_regprocedure(
    'public.create_return_request(uuid,public.return_reason,text,jsonb)'
  ) is not null,
  'customer return request RPC exists'
);

select ok(
  position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.create_return_request(uuid,public.return_reason,text,jsonb)'::regprocedure
    )
  ) > 0,
  'customer return creation requires TAKATAK-authorized session'
);

select ok(
  position(
    'v_order.customer_id IS DISTINCT FROM v_user_id'
    in pg_get_functiondef(
      'public.create_return_request(uuid,public.return_reason,text,jsonb)'::regprocedure
    )
  ) > 0,
  'return creation verifies order ownership'
);

select ok(
  position(
    'Only delivered items can be returned'
    in pg_get_functiondef(
      'public.create_return_request(uuid,public.return_reason,text,jsonb)'::regprocedure
    )
  ) > 0,
  'only delivered order items are return eligible'
);

select ok(
  position(
    'interval ''30 days'''
    in pg_get_functiondef(
      'public.create_return_request(uuid,public.return_reason,text,jsonb)'::regprocedure
    )
  ) > 0,
  'standard return window is enforced from confirmed delivery'
);

select ok(
  position(
    'A return request may contain items from one seller only'
    in pg_get_functiondef(
      'public.create_return_request(uuid,public.return_reason,text,jsonb)'::regprocedure
    )
  ) > 0,
  'each RMA is scoped to one vendor split'
);

select ok(
  position(
    'Previously returned quantity plus this request exceeds purchase quantity'
    in pg_get_functiondef(
      'public.create_return_request(uuid,public.return_reason,text,jsonb)'::regprocedure
    )
  ) > 0,
  'cumulative return quantity cannot exceed purchased quantity'
);

select ok(
  to_regprocedure('public.cancel_return_request(uuid,text)') is not null,
  'customer cancellation RPC exists'
);

select ok(
  position(
    'v_return.customer_id <> v_user_id'
    in pg_get_functiondef(
      'public.cancel_return_request(uuid,text)'::regprocedure
    )
  ) > 0,
  'only the owning customer can cancel an early-stage return'
);

select ok(
  to_regprocedure(
    'public.transition_return_request(uuid,public.return_status,text,text,text,text)'
  ) is not null,
  'operator return transition RPC exists'
);

select ok(
  position(
    'Vendor or marketplace admin required'
    in pg_get_functiondef(
      'public.transition_return_request(uuid,public.return_status,text,text,text,text)'::regprocedure
    )
  ) > 0,
  'return transitions are vendor/admin authorized'
);

select ok(
  position(
    'Invalid return transition'
    in pg_get_functiondef(
      'public.transition_return_request(uuid,public.return_status,text,text,text,text)'::regprocedure
    )
  ) > 0,
  'return status machine rejects arbitrary transitions'
);

select ok(
  position(
    'A return label is required before label-issued status'
    in pg_get_functiondef(
      'public.transition_return_request(uuid,public.return_status,text,text,text,text)'::regprocedure
    )
  ) > 0,
  'label-issued state requires actual return label data'
);

select ok(
  to_regprocedure(
    'public.reserve_return_refund(uuid,numeric,uuid,text)'
  ) is not null
  and has_function_privilege(
    'service_role',
    'public.reserve_return_refund(uuid,numeric,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reserve_return_refund(uuid,numeric,uuid,text)',
    'EXECUTE'
  ),
  'return refund reservation is service-role only'
);

select ok(
  position(
    'Marketplace admin required to approve return refund'
    in pg_get_functiondef(
      'public.reserve_return_refund(uuid,numeric,uuid,text)'::regprocedure
    )
  ) > 0,
  'return refund approval requires marketplace admin actor'
);

select ok(
  position(
    'Return refund exceeds returned merchandise value'
    in pg_get_functiondef(
      'public.reserve_return_refund(uuid,numeric,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'Return refund exceeds remaining refundable amount'
    in pg_get_functiondef(
      'public.reserve_return_refund(uuid,numeric,uuid,text)'::regprocedure
    )
  ) > 0,
  'return refund cannot exceed returned merchandise or remaining financial authority'
);

select ok(
  to_regprocedure('public.sync_return_refund_status()') is not null
  and exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.refund_records'::regclass
      and tgname = 'refund_records_sync_return_status'
      and not tgisinternal
  ),
  'Stripe refund finalization synchronizes linked return status'
);

select ok(
  to_regprocedure('public.get_return_request(uuid)') is not null
  and to_regprocedure('public.list_my_return_requests(integer)') is not null
  and to_regprocedure('public.list_vendor_return_requests(uuid,integer)') is not null,
  'curated customer/vendor RMA projections exist'
);

select is(
  public.get_1lv_schema_version(),
  '20261003033000',
  'RMA engine advances the production schema marker'
);

select * from finish();

rollback;
