begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

select is(
  public.get_1lv_schema_version(),
  '20261001214500',
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
