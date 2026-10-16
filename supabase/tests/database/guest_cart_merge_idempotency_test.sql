begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
select ok(to_regclass('public.customer_cart_merge_attempts') is not null,
  'durable idempotency journal exists');
select ok(
  (select relrowsecurity from pg_class where oid='public.customer_cart_merge_attempts'::regclass),
  'idempotency journal has row-level security enabled');
select ok(not has_table_privilege('authenticated','public.customer_cart_merge_attempts','SELECT'),
  'customer cannot inspect idempotency journal directly');
select ok(not has_table_privilege('anon','public.customer_cart_merge_attempts','SELECT'),
  'anonymous browser cannot inspect journal');
select ok(
  to_regprocedure('public.merge_guest_cart(jsonb,uuid)') is not null,
  'new idempotent cart merge function exists');
select ok(
  has_function_privilege('authenticated','public.merge_guest_cart(jsonb,uuid)','EXECUTE') and
  not has_function_privilege('anon','public.merge_guest_cart(jsonb,uuid)','EXECUTE'),
  'only authenticated sessions may request idempotent merge');
select ok(
  not has_function_privilege('authenticated','public.merge_guest_cart(jsonb)','EXECUTE'),
  'legacy non-idempotent entrypoint is no longer browser-callable');
select ok(
  position('public.require_my_cart_session()' in pg_get_functiondef(
    'public.merge_guest_cart(jsonb,uuid)'::regprocedure)) > 0
  and position('pg_advisory_xact_lock' in pg_get_functiondef(
    'public.merge_guest_cart(jsonb,uuid)'::regprocedure)) > 0,
  'new RPC is authorized and retry serialized per account');
select is(public.get_1lv_schema_version(),'20261016191000',
  'required 1LV schema version matches migration');
select * from finish();
rollback;
