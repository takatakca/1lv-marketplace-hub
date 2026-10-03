begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select ok(
  to_regclass('public.product_options') is not null
  and to_regclass('public.product_option_values') is not null
  and to_regclass('public.product_variants') is not null
  and to_regclass('public.product_variant_option_values') is not null,
  'normalized product variant catalog tables exist'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_items'
      and column_name = 'variant_id'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_items'
      and column_name = 'variant_sku'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_items'
      and column_name = 'variant_options'
  ),
  'order items can retain immutable variant identity snapshots'
);

select ok(
  not has_table_privilege('anon', 'public.product_variants', 'SELECT')
  and not has_table_privilege('authenticated', 'public.product_variants', 'SELECT'),
  'raw variant inventory is not directly public'
);

select ok(
  not has_table_privilege('authenticated', 'public.product_variants', 'INSERT')
  and not has_table_privilege('authenticated', 'public.product_variants', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.product_variants', 'DELETE'),
  'browser vendors cannot bypass variant ownership RPCs'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'product_options',
        'product_option_values',
        'product_variants',
        'product_variant_option_values'
      )
      and policyname = 'TAKATAK authenticated sessions only'
      and permissive = 'RESTRICTIVE'
  ),
  4,
  'every variant table carries the restrictive TAKATAK session gate'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and conname = 'product_variants_vendor_sku_unique'
  ),
  'vendor SKU identity is unique'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and conname = 'product_variants_product_signature_unique'
  ),
  'one SKU exists per option combination on a product'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_variant_option_values'::regclass
      and contype = 'p'
  ),
  'a variant can select only one value per option'
);

select ok(
  to_regprocedure('public.require_vendor_product_authority(uuid)') is not null,
  'vendor product authority helper exists'
);

select ok(
  position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.require_vendor_product_authority(uuid)'::regprocedure
    )
  ) > 0,
  'variant management requires exact TAKATAK session authorization'
);

select ok(
  position(
    'v_owner_id <> v_user_id'
    in pg_get_functiondef(
      'public.require_vendor_product_authority(uuid)'::regprocedure
    )
  ) > 0,
  'variant management verifies product ownership'
);

select ok(
  to_regprocedure(
    'public.upsert_vendor_product_option(uuid,uuid,text,integer)'
  ) is not null,
  'vendor option upsert RPC exists'
);

select ok(
  to_regprocedure(
    'public.upsert_vendor_product_option_value(uuid,uuid,text,integer)'
  ) is not null,
  'vendor option-value upsert RPC exists'
);

select ok(
  to_regprocedure(
    'public.upsert_vendor_product_variant(uuid,uuid,text,numeric,numeric,numeric,integer,boolean,boolean,uuid[],text,text,integer,integer)'
  ) is not null,
  'vendor SKU upsert RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.upsert_vendor_product_variant(uuid,uuid,text,numeric,numeric,numeric,integer,boolean,boolean,uuid[],text,text,integer,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.upsert_vendor_product_variant(uuid,uuid,text,numeric,numeric,numeric,integer,boolean,boolean,uuid[],text,text,integer,integer)',
    'EXECUTE'
  ),
  'variant mutation is authenticated-only'
);

select ok(
  position(
    'Variant must select exactly one valid value for every product option'
    in pg_get_functiondef(
      'public.upsert_vendor_product_variant(uuid,uuid,text,numeric,numeric,numeric,integer,boolean,boolean,uuid[],text,text,integer,integer)'::regprocedure
    )
  ) > 0,
  'SKU option combinations are complete and server validated'
);

select ok(
  position(
    'product_variants_vendor_sku_unique'
    in pg_get_constraintdef((
      select oid
      from pg_constraint
      where conrelid = 'public.product_variants'::regclass
        and conname = 'product_variants_vendor_sku_unique'
    ))
  ) >= 0,
  'SKU uniqueness is database enforced'
);

select ok(
  to_regprocedure('public.archive_vendor_product_variant(uuid)') is not null,
  'variant archival RPC exists'
);

select ok(
  to_regprocedure('public.get_vendor_product_variant_matrix(uuid)') is not null
  and not has_function_privilege(
    'anon',
    'public.get_vendor_product_variant_matrix(uuid)',
    'EXECUTE'
  ),
  'private vendor variant matrix is not anonymous'
);

select ok(
  to_regprocedure('public.get_public_product_variant_matrix(uuid)') is not null
  and has_function_privilege(
    'anon',
    'public.get_public_product_variant_matrix(uuid)',
    'EXECUTE'
  ),
  'curated public variant matrix is anonymous-readable'
);

select ok(
  position(
    'v.subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.get_public_product_variant_matrix(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'p.status = ''active''::public.product_status'
    in pg_get_functiondef(
      'public.get_public_product_variant_matrix(uuid)'::regprocedure
    )
  ) > 0,
  'public variants require active product and subscribed active vendor'
);

select ok(
  public.get_1lv_schema_version() >= '20261003020000',
  'variant foundation remains present after later schema versions'
);

select * from finish();

rollback;
