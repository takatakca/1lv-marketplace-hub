begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

select is(
  public.get_1lv_schema_version(),
  '20261002034500',
  'production schema marker is current'
);

select ok(
  to_regclass('public.profiles_takatak_person_id_unique') is not null,
  '1LV customer profiles enforce one unique TAKATAK master identity link'
);

select ok(
  to_regclass('public.vendors_takatak_merchant_id_unique') is not null,
  '1LV vendors enforce one unique TAKATAK merchant link'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_1lv_schema_version()',
    'EXECUTE'
  ),
  'anon cannot execute the private schema marker'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_1lv_schema_version()',
    'EXECUTE'
  ),
  'authenticated users cannot execute the private schema marker'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_1lv_schema_version()',
    'EXECUTE'
  ),
  'service role can execute the schema marker'
);

select ok(
  not has_column_privilege(
    'anon',
    'public.profiles',
    'takatak_person_id',
    'SELECT'
  ),
  'anonymous clients cannot read TAKATAK master identity links'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.profiles',
    'takatak_person_id',
    'SELECT'
  ),
  'authenticated clients cannot read TAKATAK master identity links'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.profiles',
    'takatak_person_id',
    'INSERT'
  ),
  'authenticated clients cannot insert TAKATAK master identity links'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.profiles',
    'takatak_person_id',
    'UPDATE'
  ),
  'authenticated clients cannot update TAKATAK master identity links'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.profiles',
    'display_name',
    'SELECT'
  ),
  'authenticated clients retain access to safe local profile fields'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.profiles',
    'display_name',
    'UPDATE'
  ),
  'authenticated clients may still update safe local profile fields'
);

select ok(
  has_column_privilege(
    'service_role',
    'public.profiles',
    'takatak_person_id',
    'UPDATE'
  ),
  'service role can persist TAKATAK master identity links'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'profiles_protect_takatak_identity'
      and tgrelid = 'public.profiles'::regclass
      and not tgisinternal
  ),
  'profile master identity trigger is installed'
);

select ok(
  to_regclass('public.profile_consent_events') is not null,
  'server-authoritative profile consent audit table exists'
);

select ok(
  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profile_consent_events'
  ), false),
  'profile consent audit table has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.profile_consent_events', 'SELECT'),
  'anonymous clients cannot read signup consent evidence'
);

select ok(
  not has_table_privilege('authenticated', 'public.profile_consent_events', 'SELECT'),
  'authenticated clients cannot read signup consent evidence directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.profile_consent_events', 'INSERT'),
  'authenticated clients cannot forge signup consent evidence'
);

select ok(
  has_table_privilege('service_role', 'public.profile_consent_events', 'SELECT')
  and has_table_privilege('service_role', 'public.profile_consent_events', 'INSERT'),
  'service role can append and inspect signup consent evidence'
);


select ok(
  to_regprocedure('public.is_takatak_authorized_session()') is not null,
  'TAKATAK session authority helper exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.is_takatak_authorized_session()',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.is_takatak_authorized_session()',
    'EXECUTE'
  ),
  'TAKATAK session authority helper is available only to authenticated/server roles'
);


select ok(
  (
    select bool_and(p.prosecdef)
    from pg_proc p
    where p.oid in (
      'public.has_role(uuid,public.app_role)'::regprocedure,
      'public.owns_vendor(uuid,uuid)'::regprocedure,
      'public.can_access_dispute(uuid,uuid)'::regprocedure
    )
  ),
  'private authorization helpers remain SECURITY DEFINER'
);

select ok(
  not has_function_privilege('anon', 'public.has_role(uuid,public.app_role)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.owns_vendor(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.can_access_dispute(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.has_role(uuid,public.app_role)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.owns_vendor(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.can_access_dispute(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.has_role(uuid,public.app_role)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.owns_vendor(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.can_access_dispute(uuid,uuid)', 'EXECUTE'),
  'SECURITY DEFINER authorization helpers are callable only by authenticated/server roles'
);

select ok(
  position(
    '_user_id = auth.uid()'
    in pg_get_functiondef('public.has_role(uuid,public.app_role)'::regprocedure)
  ) > 0
  and position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef('public.has_role(uuid,public.app_role)'::regprocedure)
  ) > 0
  and position(
    '_user_id = auth.uid()'
    in pg_get_functiondef('public.owns_vendor(uuid,uuid)'::regprocedure)
  ) > 0
  and position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef('public.owns_vendor(uuid,uuid)'::regprocedure)
  ) > 0
  and position(
    '_user_id = auth.uid()'
    in pg_get_functiondef('public.can_access_dispute(uuid,uuid)'::regprocedure)
  ) > 0
  and position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef('public.can_access_dispute(uuid,uuid)'::regprocedure)
  ) > 0,
  'SECURITY DEFINER helpers prevent cross-user probing and require TAKATAK sessions'
);

select ok(
  position(
    'normalized_email'
    in pg_get_functiondef('public.handle_new_user()'::regprocedure)
  ) > 0
  and position(
    '@auth.1lv.ca'
    in translate(
      pg_get_functiondef('public.handle_new_user()'::regprocedure),
      E'\\\\',
      ''
    )
  ) > 0
  and position(
    'raw_app_meta_data'
    in pg_get_functiondef('public.handle_new_user()'::regprocedure)
  ) = 0,
  'Auth trigger bootstraps only deterministic TAKATAK synthetic-email profiles without relying on GoTrue app-metadata timing'
);

select ok(
  not exists (
    select 1
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and not exists (
        select 1
        from pg_policies as p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.policyname = 'TAKATAK authenticated sessions only'
          and p.permissive = 'RESTRICTIVE'
      )
  ),
  'every public RLS table has the restrictive TAKATAK authenticated-session gate'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","email":"takatak.11111111-1111-4111-8111-111111111111@auth.1lv.ca","app_metadata":{"auth_source":"takatak","takatak_person_id":"11111111-1111-4111-8111-111111111111"},"amr":[{"method":"magiclink"}]}',
  true
);

select ok(
  public.is_takatak_authorized_session(),
  'a synthetic TAKATAK local magic-link session is authorized'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","email":"takatak.11111111-1111-4111-8111-111111111111@auth.1lv.ca","app_metadata":{},"amr":[{"method":"magiclink"}]}',
  true
);

select ok(
  not public.is_takatak_authorized_session(),
  'a synthetic local email without TAKATAK app metadata is rejected'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","email":"takatak.11111111-1111-4111-8111-111111111111@auth.1lv.ca","app_metadata":{"auth_source":"takatak","takatak_person_id":"11111111-1111-4111-8111-111111111111"},"amr":[{"method":"password"}]}',
  true
);

select ok(
  not public.is_takatak_authorized_session(),
  'a direct local password session is rejected even with TAKATAK app metadata'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","email":"attacker@example.invalid","app_metadata":{"auth_source":"takatak","takatak_person_id":"11111111-1111-4111-8111-111111111111"},"amr":[{"method":"magiclink"}]}',
  true
);

select ok(
  not public.is_takatak_authorized_session(),
  'TAKATAK metadata cannot authorize a non-synthetic local email'
);

select ok(
  not has_table_privilege('service_role', 'public.profile_consent_events', 'UPDATE')
  and not has_table_privilege('service_role', 'public.profile_consent_events', 'DELETE'),
  'service role cannot rewrite or delete signup consent evidence through the Data API'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.supplier_integrations',
    'credentials_encrypted',
    'SELECT'
  ),
  'supplier credentials are not readable by authenticated browser users'
);

select ok(
  not has_table_privilege('anon', 'public.vendors', 'SELECT'),
  'anon cannot select directly from private vendors table'
);

select ok(
  not has_table_privilege('anon', 'public.products', 'SELECT'),
  'anon cannot select directly from private products table'
);

select ok(
  has_function_privilege(
    'anon',
    'public.list_public_catalog_products(integer)',
    'EXECUTE'
  ),
  'anon can execute the fixed-column public catalog RPC'
);

set local session_replication_role = replica;

insert into public.vendors (
  id,
  user_id,
  store_name,
  slug,
  status,
  subscription_status
)
values (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Database Test Vendor',
  'database-test-vendor',
  'active'::public.vendor_status,
  'active'
);

set local session_replication_role = origin;

select throws_ok(
  $sql$
    insert into public.products (
      vendor_id, slug, title, category_slug, price,
      inventory_quantity, track_inventory, images, status
    )
    values (
      '11111111-1111-1111-1111-111111111111'::uuid,
      'invalid-zero-price',
      'Invalid Zero Price',
      'tests',
      0,
      5,
      true,
      '["https://example.invalid/product.jpg"]'::jsonb,
      'active'::public.product_status
    )
  $sql$,
  '22023',
  'Published products require a positive price',
  'zero-price product cannot be published'
);

select throws_ok(
  $sql$
    insert into public.products (
      vendor_id, slug, title, category_slug, price,
      inventory_quantity, track_inventory, images, status
    )
    values (
      '11111111-1111-1111-1111-111111111111'::uuid,
      'invalid-no-image',
      'Invalid No Image',
      'tests',
      10,
      5,
      true,
      '[]'::jsonb,
      'active'::public.product_status
    )
  $sql$,
  '22023',
  'Published products require at least one image',
  'product without an image cannot be published'
);

select throws_ok(
  $sql$
    insert into public.products (
      vendor_id, slug, title, category_slug, price,
      inventory_quantity, track_inventory, images, status
    )
    values (
      '11111111-1111-1111-1111-111111111111'::uuid,
      'invalid-no-stock',
      'Invalid No Stock',
      'tests',
      10,
      0,
      true,
      '["https://example.invalid/product.jpg"]'::jsonb,
      'active'::public.product_status
    )
  $sql$,
  '22023',
  'Tracked products require available inventory before publication',
  'tracked out-of-stock product cannot be published'
);

select throws_ok(
  $sql$
    insert into public.products (
      vendor_id, slug, title, category_slug, price, compare_at_price,
      inventory_quantity, track_inventory, images, status
    )
    values (
      '11111111-1111-1111-1111-111111111111'::uuid,
      'invalid-compare-at',
      'Invalid Compare At',
      'tests',
      10,
      9,
      5,
      true,
      '["https://example.invalid/product.jpg"]'::jsonb,
      'active'::public.product_status
    )
  $sql$,
  '22023',
  'Compare-at price must exceed the selling price',
  'invalid compare-at price cannot be published'
);

select lives_ok(
  $sql$
    insert into public.products (
      vendor_id, slug, title, category_slug, price, compare_at_price,
      inventory_quantity, track_inventory, images, status
    )
    values (
      '11111111-1111-1111-1111-111111111111'::uuid,
      'valid-published-product',
      'Valid Published Product',
      'tests',
      10,
      12,
      5,
      true,
      '["https://example.invalid/product.jpg"]'::jsonb,
      'active'::public.product_status
    )
  $sql$,
  'commercially valid product can be published'
);

select results_eq(
  $sql$
    select count(*)::bigint
    from public.products
    where slug = 'valid-published-product'
      and status = 'active'::public.product_status
  $sql$,
  array[1::bigint],
  'valid product persisted as active'
);

select * from finish();

rollback;
