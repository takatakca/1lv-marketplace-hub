begin;

create extension if not exists pgtap with schema extensions;

select plan(183);

select is(
  public.get_1lv_schema_version(),
  '20261002161500',
  'production schema marker is current'
);

select ok(
  to_regprocedure('public.list_public_categories()') is not null
  and to_regprocedure('public.get_public_category_by_slug(text)') is not null,
  'public active category taxonomy RPCs exist'
);

select ok(
  has_function_privilege(
    'anon',
    'public.list_public_categories()',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_public_categories()',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.list_public_categories()',
    'EXECUTE'
  )
  and has_function_privilege(
    'anon',
    'public.get_public_category_by_slug(text)',
    'EXECUTE'
  ),
  'public category taxonomy RPCs are available to storefront callers'
);

select ok(
  position(
    'c.active = true'
    in pg_get_functiondef(
      'public.list_public_categories()'::regprocedure
    )
  ) > 0
  and position(
    'c.active = true'
    in pg_get_functiondef(
      'public.get_public_category_by_slug(text)'::regprocedure
    )
  ) > 0
  and position(
    'c.slug = btrim(COALESCE(_slug, ''''))'
    in pg_get_functiondef(
      'public.get_public_category_by_slug(text)'::regprocedure
    )
  ) > 0,
  'public taxonomy exposes active categories only and slug lookups are scoped'
);

select ok(
  position(
    '''newest'''
    in pg_get_functiondef(
      'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)'::regprocedure
    )
  ) > 0
  and position(
    'CASE WHEN e.sort_mode = ''newest'' THEN e.created_at END DESC'
    in pg_get_functiondef(
      'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)'::regprocedure
    )
  ) > 0,
  'public catalog search supports newest ranking by product creation time'
);

select ok(
  to_regprocedure(
    'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)'
  ) is not null
  and has_function_privilege(
    'anon',
    'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)',
    'EXECUTE'
  ),
  'server-scoped public catalog search RPC is available to storefront callers'
);

select ok(
  position(
    'strpos('
    in pg_get_functiondef(
      'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)'::regprocedure
    )
  ) > 0
  and position(
    'v.subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)'::regprocedure
    )
  ) > 0
  and position(
    'NOT p.track_inventory OR p.inventory_quantity > 0'
    in pg_get_functiondef(
      'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)'::regprocedure
    )
  ) > 0
  and position(
    '''refunded''::public.payment_status'
    in pg_get_functiondef(
      'public.search_public_catalog_products(text,text,numeric,numeric,boolean,boolean,text,integer)'::regprocedure
    )
  ) = 0,
  'live search filters the eligible truthful catalog before applying its result limit'
);

select ok(
  position(
    '''refunded''::public.payment_status'
    in pg_get_functiondef(
      'public.list_public_catalog_products(integer)'::regprocedure
    )
  ) = 0
  and position(
    '''refunded''::public.payment_status'
    in pg_get_functiondef(
      'public.get_public_catalog_product_by_slug(text)'::regprocedure
    )
  ) = 0
  and position(
    '''refunded''::public.payment_status'
    in pg_get_functiondef(
      'public.list_public_catalog_products_for_vendor(text,integer)'::regprocedure
    )
  ) = 0
  and position(
    '''refunded''::public.payment_status'
    in pg_get_functiondef(
      'public.list_public_catalog_products_for_category(text,integer)'::regprocedure
    )
  ) = 0,
  'public sold-count projections exclude fully refunded orders'
);

select ok(
  exists (
    select 1
    from storage.buckets as b
    where b.id = 'vendor-assets'
      and b.public = false
      and b.file_size_limit = 4194304
      and b.allowed_mime_types @> ARRAY[
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif'
      ]::text[]
      and cardinality(b.allowed_mime_types) = 4
  ),
  'vendor asset bucket enforces private 4MB image-only uploads'
);

select ok(
  to_regprocedure('public.can_manage_vendor_asset(text)') is not null
  and not has_function_privilege(
    'anon',
    'public.can_manage_vendor_asset(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.can_manage_vendor_asset(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.can_manage_vendor_asset(text)',
    'EXECUTE'
  ),
  'vendor asset write authority is unavailable to anonymous callers'
);

select ok(
  position(
    'is_takatak_authorized_session'
    in pg_get_functiondef(
      'public.can_manage_vendor_asset(text)'::regprocedure
    )
  ) > 0
  and position(
    'FROM public.vendors'
    in pg_get_functiondef(
      'public.can_manage_vendor_asset(text)'::regprocedure
    )
  ) > 0
  and position(
    'storage.foldername'
    in pg_get_functiondef(
      'public.can_manage_vendor_asset(text)'::regprocedure
    )
  ) > 0,
  'vendor asset write authority requires TAKATAK session, vendor ownership and owner-prefixed paths'
);

select ok(
  (
    select roles = ARRAY['authenticated']::name[]
      and coalesce(with_check, '') like '%can_manage_vendor_asset%'
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vendor-assets owner insert'
  )
  and (
    select roles = ARRAY['authenticated']::name[]
      and coalesce(qual, '') like '%can_manage_vendor_asset%'
      and coalesce(with_check, '') like '%can_manage_vendor_asset%'
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vendor-assets owner update'
  ),
  'vendor asset insert/update policies require the centralized write authority'
);

select ok(
  (
    select roles = ARRAY['authenticated']::name[]
      and coalesce(qual, '') like '%can_manage_vendor_asset%'
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vendor-assets owner delete'
  ),
  'vendor asset delete policy requires the centralized write authority'
);

select ok(
  to_regprocedure('public.can_read_vendor_asset(text)') is not null
  and has_function_privilege(
    'anon',
    'public.can_read_vendor_asset(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.can_read_vendor_asset(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.can_read_vendor_asset(text)',
    'EXECUTE'
  ),
  'vendor asset read authority is explicitly available to storefront, owners and server'
);

select ok(
  position(
    'v.subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.can_read_vendor_asset(text)'::regprocedure
    )
  ) > 0
  and position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.can_read_vendor_asset(text)'::regprocedure
    )
  ) > 0
  and position(
    'v.logo_url = _name'
    in pg_get_functiondef(
      'public.can_read_vendor_asset(text)'::regprocedure
    )
  ) > 0
  and position(
    'v.banner_url = _name'
    in pg_get_functiondef(
      'public.can_read_vendor_asset(text)'::regprocedure
    )
  ) > 0,
  'vendor asset reads require a referenced public asset or an authorized owner/admin session'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vendor-assets public read'
  )
  and exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vendor-assets scoped read'
      and roles = ARRAY['anon','authenticated']::name[]
      and coalesce(qual, '') like '%can_read_vendor_asset%'
  ),
  'anonymous vendor asset reads are restricted to the scoped read authority'
);

select ok(
  to_regprocedure(
    'public.list_public_catalog_products_for_vendor(text,integer)'
  ) is not null
  and has_function_privilege(
    'anon',
    'public.list_public_catalog_products_for_vendor(text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_public_catalog_products_for_vendor(text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.list_public_catalog_products_for_vendor(text,integer)',
    'EXECUTE'
  ),
  'vendor-scoped public catalog RPC is available to storefront and server callers'
);

select ok(
  position(
    'v.slug = btrim(COALESCE(_vendor_slug, ''''))'
    in pg_get_functiondef(
      'public.list_public_catalog_products_for_vendor(text,integer)'::regprocedure
    )
  ) > 0
  and position(
    'v.subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.list_public_catalog_products_for_vendor(text,integer)'::regprocedure
    )
  ) > 0
  and position(
    'NOT p.track_inventory OR p.inventory_quantity > 0'
    in pg_get_functiondef(
      'public.list_public_catalog_products_for_vendor(text,integer)'::regprocedure
    )
  ) > 0,
  'vendor storefront catalog is scoped, subscription-gated and stock-aware'
);

select ok(
  to_regprocedure(
    'public.list_public_catalog_products_for_category(text,integer)'
  ) is not null
  and has_function_privilege(
    'anon',
    'public.list_public_catalog_products_for_category(text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_public_catalog_products_for_category(text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.list_public_catalog_products_for_category(text,integer)',
    'EXECUTE'
  ),
  'category-scoped public catalog RPC is available to storefront and server callers'
);

select ok(
  position(
    'p.category_slug = btrim(COALESCE(_category_slug, ''''))'
    in pg_get_functiondef(
      'public.list_public_catalog_products_for_category(text,integer)'::regprocedure
    )
  ) > 0
  and position(
    'v.subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.list_public_catalog_products_for_category(text,integer)'::regprocedure
    )
  ) > 0
  and position(
    'NOT p.track_inventory OR p.inventory_quantity > 0'
    in pg_get_functiondef(
      'public.list_public_catalog_products_for_category(text,integer)'::regprocedure
    )
  ) > 0,
  'related-product catalog is category-scoped, subscription-gated and stock-aware'
);

select ok(
  position(
    'storage.foldername(NEW.logo_url)'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0
  and position(
    'Vendor logo asset ownership mismatch'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0,
  'vendor profile authority binds logo references to the vendor owner prefix'
);

select ok(
  position(
    'storage.foldername(NEW.banner_url)'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0
  and position(
    'Vendor banner asset ownership mismatch'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0,
  'vendor profile authority binds banner references to the vendor owner prefix'
);

select ok(
  position(
    'subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.list_public_catalog_products(integer)'::regprocedure
    )
  ) > 0
  and position(
    'subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.get_public_catalog_product_by_slug(text)'::regprocedure
    )
  ) > 0,
  'public product catalog requires an eligible vendor subscription'
);

select ok(
  position(
    'subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.list_public_vendors(integer)'::regprocedure
    )
  ) > 0
  and position(
    'subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.get_public_vendor_by_slug(text)'::regprocedure
    )
  ) > 0,
  'public vendor catalog requires an eligible vendor subscription'
);

select ok(
  to_regprocedure(
    'public.normalize_canadian_checkout_address(jsonb,text)'
  ) is not null
  and not has_function_privilege(
    'anon',
    'public.normalize_canadian_checkout_address(jsonb,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.normalize_canadian_checkout_address(jsonb,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.normalize_canadian_checkout_address(jsonb,text)',
    'EXECUTE'
  ),
  'checkout address normalization is service-role only'
);

select is(
  (
    select p.provolatile::text
    from pg_proc as p
    where p.oid =
      'public.normalize_canadian_checkout_address(jsonb,text)'::regprocedure
  ),
  's',
  'checkout address normalization is correctly marked STABLE'
);

select ok(
  position(
    'v_existing_order_id'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) = 0,
  'locked checkout implementation has no unused existing-order variable'
);

select is(
  public.normalize_canadian_checkout_address(
    '{"first_name":" Jean ","last_name":" Tremblay ","address":" 123 Rue Test ","city":" Montréal ","province":"qc","postal_code":"h2x-1y4","country":"CA"}'::jsonb,
    'Shipping'
  )->>'postal_code',
  'H2X 1Y4',
  'Canadian checkout postal codes are normalized before storage'
);

select throws_ok(
  $sql$
    select public.normalize_canadian_checkout_address(
      '{"first_name":"Jean","last_name":"Tremblay","address":"123 Rue Test","city":"Montréal","province":"QC","postal_code":"00000","country":"Canada"}'::jsonb,
      'Shipping'
    )
  $sql$,
  '22023',
  'Shipping postal code is invalid',
  'invalid Canadian postal code is rejected in PostgreSQL'
);

select ok(
  position(
    'normalize_canadian_checkout_address'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    '@auth\.1lv\.ca$'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'locked checkout normalizes addresses and rejects synthetic TAKATAK receipt emails'
);

select ok(
  to_regprocedure('public.enforce_first_order_promotion_identity()') is not null
  and exists (
    select 1
    from pg_trigger
    where tgname = 'promotion_redemptions_first_order_identity'
      and tgrelid = 'public.promotion_redemptions'::regclass
      and not tgisinternal
  ),
  'first-order promotion identity trigger is installed'
);

select ok(
  to_regclass('public.promotion_redemptions_first_order_customer_uidx') is not null
  and to_regclass('public.promotion_redemptions_first_order_email_uidx') is not null,
  'first-order promotion usage is unique by customer and normalized email'
);

select ok(
  position(
    'NEW.status IN (''reserved'', ''redeemed'')'
    in pg_get_functiondef(
      'public.enforce_first_order_promotion_identity()'::regprocedure
    )
  ) > 0
  and position(
    'first_order_customer_key := NULL'
    in pg_get_functiondef(
      'public.enforce_first_order_promotion_identity()'::regprocedure
    )
  ) > 0
  and position(
    'first_order_email_key := NULL'
    in pg_get_functiondef(
      'public.enforce_first_order_promotion_identity()'::regprocedure
    )
  ) > 0,
  'first-order uniqueness applies only while redemption is reserved/redeemed and releases on terminal restoration'
);

select ok(
  position(
    'partially_refunded'
    in pg_get_functiondef(
      'public.enforce_first_order_promotion_identity()'::regprocedure
    )
  ) > 0
  and position(
    'Promotion is available on the first paid order only'
    in pg_get_functiondef(
      'public.enforce_first_order_promotion_identity()'::regprocedure
    )
  ) > 0,
  'partially refunded orders still count as prior paid orders for first-order promotions'
);

select ok(
  position(
    '''refunded'''
    in pg_get_functiondef(
      'public.enforce_first_order_promotion_identity()'::regprocedure
    )
  ) > 0,
  'fully refunded orders still count as prior paid orders for first-order promotions'
);

select ok(
  position(
    'o.customer_id = NEW.customer_id'
    in pg_get_functiondef(
      'public.enforce_first_order_promotion_identity()'::regprocedure
    )
  ) > 0
  and position(
    'lower(btrim(COALESCE(o.customer_email'
    in pg_get_functiondef(
      'public.enforce_first_order_promotion_identity()'::regprocedure
    )
  ) > 0
  and position(
    'OR lower(btrim(COALESCE(o.customer_email'
    in pg_get_functiondef(
      'public.enforce_first_order_promotion_identity()'::regprocedure
    )
  ) > 0,
  'first-order eligibility checks prior paid history by customer id or normalized email, including guest-to-account transitions'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.enforce_first_order_promotion_identity()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.enforce_first_order_promotion_identity()',
    'EXECUTE'
  ),
  'browser roles cannot invoke first-order promotion trigger function directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_vendor_commission_rates(uuid[])',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.get_vendor_commission_rates(uuid[])',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.get_vendor_commission_rates(uuid[])',
    'EXECUTE'
  ),
  'vendor commission helper is service-role only'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_public_product_by_slug(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.get_public_product_by_slug(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.get_public_product_by_slug(text)',
    'EXECUTE'
  ),
  'legacy single-product public RPC is retired from browser roles'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_public_products(integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.list_public_products(integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.list_public_products(integer)',
    'EXECUTE'
  ),
  'legacy product-list public RPC is retired from browser roles'
);

select ok(
  not has_table_privilege('anon', 'public.public_products', 'SELECT')
  and not has_table_privilege('authenticated', 'public.public_products', 'SELECT')
  and not has_table_privilege('anon', 'public.public_vendors', 'SELECT')
  and not has_table_privilege('authenticated', 'public.public_vendors', 'SELECT'),
  'legacy public catalog views remain inaccessible to browser roles'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'Authenticated can view active products'
  ),
  'authenticated customers cannot read private active-product rows directly'
);

select ok(
  to_regprocedure('public.enforce_marketplace_creation_timestamps()') is not null
  and exists (
    select 1
    from pg_trigger
    where tgname = 'vendors_creation_timestamp_authority'
      and tgrelid = 'public.vendors'::regclass
      and not tgisinternal
  )
  and exists (
    select 1
    from pg_trigger
    where tgname = 'products_creation_timestamp_authority'
      and tgrelid = 'public.products'::regclass
      and not tgisinternal
  ),
  'vendor and product creation timestamps are protected by database triggers'
);

select ok(
  not (
    select p.prosecdef
    from pg_proc as p
    where p.oid = 'public.enforce_marketplace_creation_timestamps()'::regprocedure
  )
  and position(
    'NEW.created_at := now()'
    in pg_get_functiondef(
      'public.enforce_marketplace_creation_timestamps()'::regprocedure
    )
  ) > 0
  and position(
    'Marketplace creation timestamp is server-authoritative'
    in pg_get_functiondef(
      'public.enforce_marketplace_creation_timestamps()'::regprocedure
    )
  ) > 0,
  'browser marketplace creation timestamps are server-authoritative and immutable'
);

select ok(
  to_regprocedure('public.enforce_vendor_profile_authority()') is not null
  and exists (
    select 1
    from pg_trigger
    where tgname = 'vendors_profile_authority'
      and tgrelid = 'public.vendors'::regclass
      and not tgisinternal
  ),
  'vendor profile authority trigger is installed'
);

select ok(
  not (
    select p.prosecdef
    from pg_proc as p
    where p.oid = 'public.enforce_vendor_profile_authority()'::regprocedure
  ),
  'vendor profile authority trigger runs as SECURITY INVOKER'
);

select ok(
  position(
    'Vendor attempted to modify server-authoritative fields'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0
  and position(
    'NEW.payouts_enabled IS DISTINCT FROM OLD.payouts_enabled'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0
  and position(
    'NEW.commission_rate IS DISTINCT FROM OLD.commission_rate'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0
  and position(
    'NEW.stripe_connect_account_id IS DISTINCT FROM OLD.stripe_connect_account_id'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0,
  'browser vendor cannot mutate payout, commission, or Stripe authority fields'
);

select ok(
  position(
    'require_vendor_approval'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0
  and position(
    'default_commission_rate'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0
  and position(
    'NEW.commission_rate := v_default_commission'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0
  and position(
    'NEW.subscription_status := ''none'''
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0
  and position(
    'NEW.payouts_enabled := false'
    in pg_get_functiondef(
      'public.enforce_vendor_profile_authority()'::regprocedure
    )
  ) > 0,
  'new vendor records use marketplace approval/commission settings while preserving safe server-owned defaults'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendors'
      and policyname = 'Vendors can update their own record'
      and coalesce(qual, '') like '%user_id%'
      and coalesce(with_check, '') like '%user_id%'
  ),
  'vendor profile update policy preserves ownership in USING and WITH CHECK'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendors'
      and policyname = 'Users can create their own vendor record'
      and coalesce(with_check, '') like '%user_id%'
      and coalesce(with_check, '') like '%pending%'
      and coalesce(with_check, '') like '%active%'
  ),
  'vendor insert policy accepts only ownership plus trigger-generated pending/active states'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendors'
      and policyname = 'Authenticated can view active vendors'
  ),
  'authenticated customers cannot read private active-vendor rows directly'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendors'
      and policyname = 'Vendors can view their own private record'
      and coalesce(qual, '') like '%user_id%'
  ),
  'vendor owner retains access to its private vendor row'
);

select ok(
  to_regprocedure('public.enforce_vendor_product_authority()') is not null
  and exists (
    select 1
    from pg_trigger
    where tgname = 'products_vendor_authority'
      and tgrelid = 'public.products'::regclass
      and not tgisinternal
  ),
  'vendor product authority trigger is installed'
);

select ok(
  not (
    select p.prosecdef
    from pg_proc as p
    where p.oid = 'public.enforce_vendor_product_authority()'::regprocedure
  ),
  'vendor product authority trigger runs as SECURITY INVOKER'
);

select ok(
  position(
    'Only marketplace admins may approve or reject products'
    in pg_get_functiondef(
      'public.enforce_vendor_product_authority()'::regprocedure
    )
  ) > 0
  and position(
    'NEW.status := ''pending_review''::public.product_status'
    in pg_get_functiondef(
      'public.enforce_vendor_product_authority()'::regprocedure
    )
  ) > 0,
  'vendors cannot self-approve and commercial edits return active products to review'
);

select ok(
  position(
    'subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.enforce_vendor_product_authority()'::regprocedure
    )
  ) > 0,
  'product review submission requires an active subscribed vendor'
);

select ok(
  position(
    'require_product_approval'
    in pg_get_functiondef(
      'public.enforce_vendor_product_authority()'::regprocedure
    )
  ) > 0
  and position(
    'NOT v_require_approval'
    in pg_get_functiondef(
      'public.enforce_vendor_product_authority()'::regprocedure
    )
  ) > 0
  and position(
    'NEW.status := ''active''::public.product_status'
    in pg_get_functiondef(
      'public.enforce_vendor_product_authority()'::regprocedure
    )
  ) > 0,
  'product authority honors the admin approval setting without allowing browser self-approval'
);

select ok(
  not exists (
    select 1
    from pg_trigger
    where tgname in (
      'enforce_vendor_marketplace_fields_trigger',
      'enforce_product_marketplace_fields_trigger'
    )
      and not tgisinternal
  ),
  'superseded marketplace authority triggers are removed'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'Vendors update own products'
      and coalesce(qual, '') like '%user_id%'
      and coalesce(with_check, '') like '%user_id%'
  ),
  'vendor product update policy preserves ownership in USING and WITH CHECK'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'Vendors insert own products'
      and coalesce(with_check, '') like '%user_id%'
      and coalesce(with_check, '') like '%draft%'
      and coalesce(with_check, '') like '%pending_review%'
      and coalesce(with_check, '') like '%active%'
  ),
  'vendor product insert policy accepts only ownership plus trigger-generated draft/review/active states'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'Vendors delete own products'
      and coalesce(qual, '') like '%draft%'
      and coalesce(qual, '') like '%user_id%'
  ),
  'vendors may hard-delete only their own draft products'
);

select ok(
  to_regprocedure('public.assert_checkout_items_safe(jsonb)') is not null,
  'checkout JSON cast-safety validator exists'
);

select ok(
  position(
    'public.assert_checkout_items_safe(_items)'
    in pg_get_functiondef(
      'public.create_marketplace_order(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'public.assert_checkout_items_safe(_items)'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'both canonical checkout RPCs validate JSON before internal casts'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.assert_checkout_items_safe(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.assert_checkout_items_safe(jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.assert_checkout_items_safe(jsonb)',
    'EXECUTE'
  ),
  'checkout cast-safety validator is service-role only'
);

select throws_ok(
  $sql$
    select public.assert_checkout_items_safe(
      '[{"product_id":"11111111-1111-4111-8111-111111111111","quantity":"999999999999999999999999999999999"}]'::jsonb
    )
  $sql$,
  '22023',
  'Each checkout item must have a valid product and quantity',
  'oversized numeric quantity is rejected before integer casting'
);

select ok(
  to_regprocedure('public.release_order_inventory(uuid,text)') is not null,
  'PaymentIntent-bound inventory release RPC exists'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.release_order_inventory(uuid)',
    'EXECUTE'
  ),
  'historical one-argument inventory release RPC is retired from service role'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.release_expired_inventory_reservations(integer)',
    'EXECUTE'
  ),
  'historical bulk expired-inventory release RPC is retired from service role'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.release_order_inventory(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.release_order_inventory(uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.release_order_inventory(uuid,text)',
    'EXECUTE'
  ),
  'only service role may execute PaymentIntent-bound inventory release'
);

select ok(
  position(
    'inventory_reserved_until > now()'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'IS DISTINCT FROM _expected_payment_intent_id'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'inventory_reserved_until <= now()'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'IS NOT DISTINCT FROM _expected_payment_intent_id'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'payment_status = ''failed''::public.payment_status'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'status = ''cancelled''::public.order_status'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0,
  'inventory release requires expiry and exact checked PaymentIntent before terminal cancellation'
);

select ok(
  to_regprocedure('public.enforce_refund_vendor_scope()') is not null
  and exists (
    select 1
    from pg_trigger
    where tgname = 'refund_records_enforce_vendor_scope'
      and tgrelid = 'public.refund_records'::regclass
      and not tgisinternal
  ),
  'refund vendor-scope trigger is installed'
);

select ok(
  position(
    'Automatic marketplace refunds require a vendor order'
    in pg_get_functiondef('public.enforce_refund_vendor_scope()'::regprocedure)
  ) > 0
  and position(
    'vo.order_id = NEW.order_id'
    in pg_get_functiondef('public.enforce_refund_vendor_scope()'::regprocedure)
  ) > 0,
  'refund scope trigger requires a matching vendor order before automatic processing'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.enforce_refund_vendor_scope()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.enforce_refund_vendor_scope()',
    'EXECUTE'
  ),
  'browser roles cannot invoke the refund scope trigger function directly'
);

select ok(
  to_regprocedure(
    'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)'
  ) is not null,
  'atomic vendor payout generation RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)',
    'EXECUTE'
  ),
  'only service role may generate vendor payouts atomically'
);

select ok(
  position(
    'pg_advisory_xact_lock'
    in pg_get_functiondef(
      'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)'::regprocedure
    )
  ) > 0,
  'atomic payout generation serializes concurrent generators by vendor'
);

select ok(
  position(
    'FOR UPDATE OF vo'
    in pg_get_functiondef(
      'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)'::regprocedure
    )
  ) > 0
  and position(
    'v_inserted_items <> v_item_count'
    in pg_get_functiondef(
      'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)'::regprocedure
    )
  ) > 0,
  'atomic payout generation locks vendor orders and verifies every payout item'
);

select ok(
  position(
    'v_claimed_adjustments <> v_adjustment_count'
    in pg_get_functiondef(
      'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)'::regprocedure
    )
  ) > 0
  and position(
    'v_unresolved_clawback'
    in pg_get_functiondef(
      'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)'::regprocedure
    )
  ) > 0,
  'atomic payout generation verifies adjustments and blocks unresolved refund clawbacks'
);

select ok(
  not (
    select p.prosecdef
    from pg_proc p
    where p.oid =
      'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)'::regprocedure
  ),
  'atomic payout generation runs as SECURITY INVOKER'
);

select ok(
  position(
    'FOR UPDATE OF source'
    in pg_get_functiondef(
      'public.create_vendor_payout_atomic(uuid,date,date,timestamp with time zone)'::regprocedure
    )
  ) > 0,
  'atomic payout generation locks source payouts used by refund clawbacks'
);

select ok(
  to_regprocedure(
    'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'
  ) is not null,
  'locked server-authoritative checkout RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)',
    'EXECUTE'
  ),
  'only service role may execute the locked checkout RPC'
);

select ok(
  to_regprocedure(
    'public.create_marketplace_order_locked_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'
  ) is not null
  and position(
    'checkout_request_hash'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'Checkout idempotency key conflict'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'create_marketplace_order_locked_unchecked'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'checkout wrapper delegates to the payload-bound idempotent implementation'
);

select ok(
  position(
    'hashtextextended(v_idempotency_hash, 0)'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'hashtextextended(v_product_id::text, 42117)'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'checkout implementation serializes the idempotency key and then deterministically locks products'
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
  to_regprocedure('public.claim_stripe_event(text,text,jsonb)') is not null,
  'Stripe webhook claim RPC exists'
);

select ok(
  to_regprocedure('public.finalize_refund_accounting(uuid,text)') is not null,
  'Stripe refund accounting RPC exists'
);

select ok(
  position(
    'Refund changed payout amount; review before transfer.'
    in pg_get_functiondef(
      'public.finalize_refund_accounting(uuid,text)'::regprocedure
    )
  ) > 0,
  'refund finalization recalculates and re-holds payouts that have not transferred'
);

select ok(
  position(
    'refund_clawback'
    in pg_get_functiondef(
      'public.finalize_refund_accounting(uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'processing'
    in pg_get_functiondef(
      'public.finalize_refund_accounting(uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'paid'
    in pg_get_functiondef(
      'public.finalize_refund_accounting(uuid,text)'::regprocedure
    )
  ) > 0,
  'refund finalization creates idempotent clawbacks once payout transfer processing began'
);

select ok(
  position(
    'mark_order_promotion_refunded'
    in pg_get_functiondef(
      'public.finalize_refund_accounting(uuid,text)'::regprocedure
    )
  ) > 0,
  'full refund finalization restores eligible promotion usage'
);

select ok(
  position(
    '''refunded''::public.order_status'
    in pg_get_functiondef(
      'public.finalize_refund_accounting(uuid,text)'::regprocedure
    )
  ) > 0,
  'fully refunded order is marked refunded at the order lifecycle level'
);

select ok(
  to_regprocedure('public.reserve_dispute_refund(uuid,numeric,text,uuid)') is not null,
  'atomic dispute refund reservation RPC exists'
);

select ok(
  to_regprocedure(
    'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)'
  ) is not null,
  'server-authoritative vendor fulfillment RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)',
    'EXECUTE'
  ),
  'only authenticated TAKATAK sessions or service role may call vendor fulfillment RPC'
);

select ok(
  not has_table_privilege('authenticated','public.vendor_orders','UPDATE')
  and not has_table_privilege('authenticated','public.order_items','UPDATE'),
  'browser sessions cannot directly mutate vendor fulfillment tables'
);

select ok(
  to_regprocedure('public.vendor_can_view_paid_order(uuid)') is not null
  and to_regprocedure(
    'public.vendor_can_view_paid_order_scope(uuid,uuid)'
  ) is not null,
  'non-recursive paid-order vendor visibility helpers exist'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.vendor_can_view_paid_order(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.vendor_can_view_paid_order_scope(uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.vendor_can_view_paid_order(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.vendor_can_view_paid_order_scope(uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.vendor_can_view_paid_order(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.vendor_can_view_paid_order_scope(uuid,uuid)',
    'EXECUTE'
  ),
  'paid-order visibility helpers are callable only by authenticated/server roles'
);

select ok(
  position(
    'auth.uid()'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'partially_refunded'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'auth.uid()'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order_scope(uuid,uuid)'::regprocedure
    )
  ) > 0
  and position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order_scope(uuid,uuid)'::regprocedure
    )
  ) > 0
  and position(
    'partially_refunded'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order_scope(uuid,uuid)'::regprocedure
    )
  ) > 0
  and position(
    'inventory_committed_at IS NOT NULL'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'inventory_released_at IS NULL'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order_scope(uuid,uuid)'::regprocedure
    )
  ) > 0,
  'visibility helpers bind identity, TAKATAK session, payment, and committed inventory'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'Vendors view related orders'
  )
  and to_regprocedure(
    'public.list_vendor_orders_for_current_user(uuid)'
  ) is not null
  and to_regprocedure(
    'public.get_vendor_order_for_current_user(uuid)'
  ) is not null,
  'vendor parent orders are exposed only through curated projection RPCs'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_orders'
      and policyname = 'Vendors view own vendor orders'
      and coalesce(qual, '') like '%vendor_can_view_paid_order_scope%'
  ),
  'vendor split policy uses the non-recursive paid-order helper'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'Vendors view own order items'
      and coalesce(qual, '') like '%vendor_can_view_paid_order_scope%'
  ),
  'vendor line-item policy uses the non-recursive paid-order helper'
);

select ok(
  position(
    'is_takatak_authorized_session'
    in pg_get_functiondef(
      'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)'::regprocedure
    )
  ) > 0
  and position(
    'Vendor fulfillment requires a paid order'
    in pg_get_functiondef(
      'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)'::regprocedure
    )
  ) > 0
  and position(
    'Vendor fulfillment requires committed inventory'
    in pg_get_functiondef(
      'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)'::regprocedure
    )
  ) > 0,
  'vendor fulfillment RPC requires TAKATAK auth, payment, and committed inventory'
);

select ok(
  position(
    'UPDATE public.order_items'
    in pg_get_functiondef(
      'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)'::regprocedure
    )
  ) > 0
  and position(
    'UPDATE public.orders'
    in pg_get_functiondef(
      'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)'::regprocedure
    )
  ) > 0,
  'vendor fulfillment RPC synchronizes line items and parent order state'
);

select ok(
  position(
    'Vendor fulfillment requires committed inventory'
    in pg_get_functiondef(
      'public.update_vendor_order_fulfillment(uuid,public.vendor_order_status,text,text)'::regprocedure
    )
  ) > 0,
  'vendor fulfillment RPC blocks paid orders whose inventory was released'
);

select ok(
  position(
    'inventory_committed_at IS NOT NULL'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'inventory_released_at IS NULL'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order(uuid)'::regprocedure
    )
  ) > 0,
  'vendor order-parent visibility requires committed, unreleased inventory'
);

select ok(
  position(
    'inventory_committed_at IS NOT NULL'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order_scope(uuid,uuid)'::regprocedure
    )
  ) > 0
  and position(
    'inventory_released_at IS NULL'
    in pg_get_functiondef(
      'public.vendor_can_view_paid_order_scope(uuid,uuid)'::regprocedure
    )
  ) > 0,
  'vendor scoped visibility requires committed, unreleased inventory'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_orders'
      and policyname = 'Vendors view own vendor orders'
      and coalesce(qual, '') like '%vendor_can_view_paid_order_scope%'
  )
  and exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'Vendors view own order items'
      and coalesce(qual, '') like '%vendor_can_view_paid_order_scope%'
  ),
  'inventory-gated vendor policies remain non-recursive'
);

select ok(
  to_regclass('public.disputes_one_open_per_vendor_order') is not null,
  'database prevents concurrent duplicate open disputes for one vendor split'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.reserve_dispute_refund(uuid,numeric,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reserve_dispute_refund(uuid,numeric,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.reserve_dispute_refund(uuid,numeric,text,uuid)',
    'EXECUTE'
  ),
  'only service role may reserve an approved dispute refund'
);

select ok(
  position(
    'FOR UPDATE'
    in pg_get_functiondef(
      'public.reserve_dispute_refund(uuid,numeric,text,uuid)'::regprocedure
    )
  ) > 0,
  'refund reservation function locks rows before calculating remaining value'
);

select ok(
  position(
    'refund_already_reserved'
    in pg_get_functiondef(
      'public.reserve_dispute_refund(uuid,numeric,text,uuid)'::regprocedure
    )
  ) > 0,
  'refund reservation refuses a second live refund for the same dispute'
);

select ok(
  not has_function_privilege('anon','public.claim_stripe_event(text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.claim_stripe_event(text,text,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.claim_stripe_event(text,text,jsonb)','EXECUTE'),
  'only service role may claim Stripe webhook events'
);

select ok(
  not has_function_privilege('anon','public.finalize_refund_accounting(uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.finalize_refund_accounting(uuid,text)','EXECUTE')
  and has_function_privilege('service_role','public.finalize_refund_accounting(uuid,text)','EXECUTE'),
  'only service role may finalize Stripe refund accounting'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stripe_event_log' and column_name='status'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stripe_event_log' and column_name='last_error'
  ),
  'Stripe event log stores processing state and failure details'
);

select ok(
  not has_table_privilege('anon','public.stripe_event_log','INSERT')
  and not has_table_privilege('anon','public.stripe_event_log','UPDATE')
  and not has_table_privilege('authenticated','public.stripe_event_log','INSERT')
  and not has_table_privilege('authenticated','public.stripe_event_log','UPDATE')
  and has_table_privilege('service_role','public.stripe_event_log','INSERT')
  and has_table_privilege('service_role','public.stripe_event_log','UPDATE'),
  'only service role may write Stripe webhook event state'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stripe_event_log'
      and policyname = 'Admins read stripe events'
      and coalesce(qual, '') like '%has_role%'
      and coalesce(qual, '') like '%admin%'
  ),
  'Stripe webhook payload log remains readable only through the admin RLS policy'
);

select ok(
  to_regclass('public.payout_adjustments_refund_unique') is not null,
  'each refund can create at most one payout carry-forward adjustment'
);

select is(
  public.claim_stripe_event(
    'evt_pgtap_atomic_claim',
    'payment_intent.succeeded',
    '{"id":"evt_pgtap_atomic_claim","type":"payment_intent.succeeded"}'::jsonb
  ),
  true,
  'first Stripe event claim succeeds'
);

select is(
  public.claim_stripe_event(
    'evt_pgtap_atomic_claim',
    'payment_intent.succeeded',
    '{"id":"evt_pgtap_atomic_claim","type":"payment_intent.succeeded"}'::jsonb
  ),
  false,
  'duplicate processing Stripe event claim is rejected'
);

update public.stripe_event_log
set updated_at = now() - interval '11 minutes'
where id = 'evt_pgtap_atomic_claim';

select is(
  public.claim_stripe_event(
    'evt_pgtap_atomic_claim',
    'payment_intent.succeeded',
    '{"id":"evt_pgtap_atomic_claim","type":"payment_intent.succeeded"}'::jsonb
  ),
  true,
  'stale processing Stripe event claim can be recovered after the lease expires'
);

select is(
  public.claim_stripe_event(
    'evt_pgtap_atomic_claim',
    'payment_intent.succeeded',
    '{"id":"evt_pgtap_atomic_claim","type":"payment_intent.succeeded"}'::jsonb
  ),
  false,
  'freshly reclaimed Stripe event remains exclusive'
);

update public.stripe_event_log
set
  status = 'processed',
  processed_at = now(),
  updated_at = now() - interval '11 minutes'
where id = 'evt_pgtap_atomic_claim';

select is(
  public.claim_stripe_event(
    'evt_pgtap_atomic_claim',
    'payment_intent.succeeded',
    '{"id":"evt_pgtap_atomic_claim","type":"payment_intent.succeeded"}'::jsonb
  ),
  false,
  'processed Stripe event is never reclaimed even when old'
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
  to_regclass('public.takatak_authorized_sessions') is not null,
  'server-side TAKATAK session grant registry exists'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.takatak_authorized_sessions',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.takatak_authorized_sessions',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.takatak_authorized_sessions',
    'INSERT'
  )
  and has_table_privilege(
    'service_role',
    'public.takatak_authorized_sessions',
    'SELECT'
  )
  and has_table_privilege(
    'service_role',
    'public.takatak_authorized_sessions',
    'INSERT'
  ),
  'only the trusted server can read or create TAKATAK session grants'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid = 'public.is_takatak_authorized_session()'::regprocedure
  )
  and position(
    'public.takatak_authorized_sessions'
    in pg_get_functiondef(
      'public.is_takatak_authorized_session()'::regprocedure
    )
  ) > 0,
  'session authority helper is SECURITY DEFINER and requires the server grant registry'
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
  '{"sub":"22222222-2222-4222-8222-222222222222","session_id":"66666666-6666-4666-8666-666666666666","email":"takatak.11111111-1111-4111-8111-111111111111@auth.1lv.ca","app_metadata":{"auth_source":"takatak","takatak_person_id":"11111111-1111-4111-8111-111111111111"},"amr":[{"method":"magiclink"}]}',
  true
);

select ok(
  not public.is_takatak_authorized_session(),
  'a direct synthetic magic-link session is rejected before server grant'
);

set local session_replication_role = replica;

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '22222222-2222-4222-8222-222222222222'::uuid,
  'authenticated',
  'authenticated',
  'takatak.11111111-1111-4111-8111-111111111111@auth.1lv.ca',
  now(),
  '{"auth_source":"takatak","takatak_person_id":"11111111-1111-4111-8111-111111111111"}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.takatak_authorized_sessions (
  session_id,
  user_id,
  takatak_person_id
)
values (
  '66666666-6666-4666-8666-666666666666'::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid
);

set local session_replication_role = origin;

select ok(
  public.is_takatak_authorized_session(),
  'only a server-granted TAKATAK magic-link session is authorized'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.revoke_current_takatak_session()',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.revoke_current_takatak_session()',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.revoke_current_takatak_session()',
    'EXECUTE'
  ),
  'current-session revocation is available only to authenticated/server roles'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","session_id":"66666666-6666-4666-8666-666666666666","email":"takatak.11111111-1111-4111-8111-111111111111@auth.1lv.ca","app_metadata":{},"amr":[{"method":"magiclink"}]}',
  true
);

select ok(
  not public.is_takatak_authorized_session(),
  'a synthetic local email without TAKATAK app metadata is rejected'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","session_id":"66666666-6666-4666-8666-666666666666","email":"takatak.11111111-1111-4111-8111-111111111111@auth.1lv.ca","app_metadata":{"auth_source":"takatak","takatak_person_id":"11111111-1111-4111-8111-111111111111"},"amr":[{"method":"password"}]}',
  true
);

select ok(
  not public.is_takatak_authorized_session(),
  'a direct local password session is rejected even with TAKATAK app metadata'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","session_id":"66666666-6666-4666-8666-666666666666","email":"attacker@example.invalid","app_metadata":{"auth_source":"takatak","takatak_person_id":"11111111-1111-4111-8111-111111111111"},"amr":[{"method":"magiclink"}]}',
  true
);

select ok(
  not public.is_takatak_authorized_session(),
  'TAKATAK metadata cannot authorize a non-synthetic local email'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","session_id":"66666666-6666-4666-8666-666666666666","email":"takatak.11111111-1111-4111-8111-111111111111@auth.1lv.ca","app_metadata":{"auth_source":"takatak","takatak_person_id":"11111111-1111-4111-8111-111111111111"},"amr":[{"method":"magiclink"}]}',
  true
);

select ok(
  public.revoke_current_takatak_session(),
  'an active TAKATAK session can revoke only its own grant'
);

select ok(
  not public.is_takatak_authorized_session(),
  'revoked TAKATAK session loses authorization immediately'
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

select lives_ok(
  $sql$
    update public.products
    set inventory_quantity = 0
    where slug = 'valid-published-product'
      and status = 'active'::public.product_status
  $sql$,
  'active tracked product can sell its final unit and reach zero inventory'
);

select results_eq(
  $sql$
    select inventory_quantity::bigint
    from public.products
    where slug = 'valid-published-product'
  $sql$,
  array[0::bigint],
  'sold-out product persists with zero inventory instead of rolling back checkout'
);


select ok(
  to_regprocedure('public.list_vendor_orders_for_current_user(uuid)') is not null
  and to_regprocedure('public.get_vendor_order_for_current_user(uuid)') is not null,
  'vendor-safe order projection RPCs exist'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_vendor_orders_for_current_user(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_vendor_orders_for_current_user(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.list_vendor_orders_for_current_user(uuid)',
    'EXECUTE'
  ),
  'vendor list projection is callable only by authenticated browser sessions'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_vendor_order_for_current_user(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_vendor_order_for_current_user(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_vendor_order_for_current_user(uuid)',
    'EXECUTE'
  ),
  'vendor detail projection is callable only by authenticated browser sessions'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'Vendors view related orders'
  ),
  'vendors cannot select the full parent orders row directly'
);

select ok(
  position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.list_vendor_orders_for_current_user(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'o.inventory_committed_at IS NOT NULL'
    in pg_get_functiondef(
      'public.list_vendor_orders_for_current_user(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'partially_refunded'
    in pg_get_functiondef(
      'public.get_vendor_order_for_current_user(uuid)'::regprocedure
    )
  ) > 0,
  'vendor order projections require TAKATAK auth, paid state, and committed inventory'
);

select ok(
  position(
    'stripe_payment_intent_id'
    in pg_get_functiondef(
      'public.get_vendor_order_for_current_user(uuid)'::regprocedure
    )
  ) = 0
  and position(
    'stripe_charge_id'
    in pg_get_functiondef(
      'public.get_vendor_order_for_current_user(uuid)'::regprocedure
    )
  ) = 0
  and position(
    'billing_address'
    in pg_get_functiondef(
      'public.get_vendor_order_for_current_user(uuid)'::regprocedure
    )
  ) = 0
  and position(
    'checkout_request_hash'
    in pg_get_functiondef(
      'public.get_vendor_order_for_current_user(uuid)'::regprocedure
    )
  ) = 0
  and position(
    'takatak_order_event_id'
    in pg_get_functiondef(
      'public.get_vendor_order_for_current_user(uuid)'::regprocedure
    )
  ) = 0
  and position(
    'o.total'
    in pg_get_functiondef(
      'public.get_vendor_order_for_current_user(uuid)'::regprocedure
    )
  ) = 0,
  'vendor projection excludes marketplace-wide financial and internal linkage fields'
);


select ok(
  to_regprocedure('public.recalculate_new_checkout_tax(uuid)') is not null
  and not has_function_privilege(
    'anon',
    'public.recalculate_new_checkout_tax(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.recalculate_new_checkout_tax(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.recalculate_new_checkout_tax(uuid)',
    'EXECUTE'
  ),
  'new checkout tax recalculation is service-role only'
);

select ok(
  position(
    'v_taxable_shipping'
    in pg_get_functiondef(
      'public.recalculate_new_checkout_tax(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'v_order.stripe_payment_intent_id IS NOT NULL'
    in pg_get_functiondef(
      'public.recalculate_new_checkout_tax(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'v_taxable_merchandise + v_taxable_shipping'
    in pg_get_functiondef(
      'public.recalculate_new_checkout_tax(uuid)'::regprocedure
    )
  ) > 0,
  'checkout tax includes customer-paid delivery and fails closed after Stripe authorization'
);

select ok(
  position(
    'public.recalculate_new_checkout_tax(v_order_id)'
    in pg_get_functiondef(
      'public.create_marketplace_order(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'public.recalculate_new_checkout_tax(v_order_id)'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'IF NOT v_reused THEN'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'canonical checkout applies taxable delivery only to newly created orders'
);


select ok(
  to_regprocedure('public.list_public_categories()') is not null
  and to_regprocedure('public.get_public_category_by_slug(text)') is not null,
  'public category taxonomy RPCs exist'
);

select ok(
  has_function_privilege(
    'anon',
    'public.list_public_categories()',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_public_categories()',
    'EXECUTE'
  )
  and has_function_privilege(
    'anon',
    'public.get_public_category_by_slug(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_public_category_by_slug(text)',
    'EXECUTE'
  ),
  'browser roles can execute only the dedicated public category projections'
);

select ok(
  position(
    'WHERE c.active = true'
    in pg_get_functiondef(
      'public.list_public_categories()'::regprocedure
    )
  ) > 0
  and position(
    'WHERE c.active = true'
    in pg_get_functiondef(
      'public.get_public_category_by_slug(text)'::regprocedure
    )
  ) > 0,
  'public category projections expose active taxonomy only'
);

select * from finish();

rollback;
