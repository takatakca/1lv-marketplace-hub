begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
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
  exists(select 1 from pg_policies where schemaname='public'
    and tablename='customer_cart_merge_attempts'
    and policyname='Authorized owner merge journal'),
  'journal policy checks authorized owner for all actions');
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

-- Real transactional replay with two separate simulated TAKATAK-authorized
-- sessions. Test-only fixtures are rolled back and never touch live Supabase.
set local session_replication_role = replica;

insert into public.profiles (id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Merge User A'),
  ('22222222-2222-4222-8222-222222222222', 'Merge User B');

insert into public.takatak_authorized_sessions
  (session_id, user_id, takatak_person_id)
values
  ('33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111',
   '44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555',
   '22222222-2222-4222-8222-222222222222',
   '66666666-6666-4666-8666-666666666666');

set local session_replication_role = origin;

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','11111111-1111-4111-8111-111111111111',
  'role','authenticated',
  'session_id','33333333-3333-4333-8333-333333333333',
  'email','takatak.44444444-4444-4444-8444-444444444444@auth.1lv.ca',
  'app_metadata',jsonb_build_object(
    'auth_source','takatak',
    'takatak_person_id','44444444-4444-4444-8444-444444444444'),
  'amr',jsonb_build_array(jsonb_build_object('method','otp'))
)::text,true);

select ok(public.is_takatak_authorized_session(),
  'test-only TAKATAK JWT is properly authorized');

select lives_ok(
  $ select public.merge_guest_cart(
    '[]'::jsonb,'77777777-7777-4777-8777-777777777777'::uuid) $,
  'first empty guest merge is durably recorded');

select lives_ok(
  $ select public.merge_guest_cart(
    '[]'::jsonb,'77777777-7777-4777-8777-777777777777'::uuid) $,
  'same account and key can be safely retried');

select is(
  (select count(*)::integer from public.customer_cart_merge_attempts
    where customer_id='11111111-1111-4111-8111-111111111111'),
  1,
  'a repeated merge created exactly one journal entry');

select throws_ok(
  $ select public.merge_guest_cart(
    '[{}]'::jsonb,'77777777-7777-4777-8777-777777777777'::uuid) $,
  '22023',
  'Guest cart merge key reused with different items',
  'same key cannot be replayed with a changed payload');

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','22222222-2222-4222-8222-222222222222',
  'role','authenticated',
  'session_id','55555555-5555-4555-8555-555555555555',
  'email','takatak.66666666-6666-4666-8666-666666666666@auth.1lv.ca',
  'app_metadata',jsonb_build_object(
    'auth_source','takatak',
    'takatak_person_id','66666666-6666-4666-8666-666666666666'),
  'amr',jsonb_build_array(jsonb_build_object('method','otp'))
)::text,true);

select lives_ok(
  $ select public.merge_guest_cart(
    '[]'::jsonb,'77777777-7777-4777-8777-777777777777'::uuid) $,
  'another account has independent idempotency scope even for same key');

select is(
  (select count(*)::integer from public.customer_cart_merge_attempts
    where merge_key='77777777-7777-4777-8777-777777777777'),
  2,
  'same merge key is isolated by customer');

select * from finish();
rollback;
