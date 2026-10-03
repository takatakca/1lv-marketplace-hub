begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select ok(
  to_regclass('public.saved_lists') is not null
  and to_regclass('public.saved_list_items') is not null,
  'persistent account saved-list tables exist'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in ('saved_lists', 'saved_list_items')
      and policyname = 'TAKATAK authenticated sessions only'
      and permissive = 'RESTRICTIVE'
  ),
  2,
  'saved-list tables have restrictive TAKATAK session gates'
);

select ok(
  not has_table_privilege('authenticated', 'public.saved_lists', 'SELECT')
  and not has_table_privilege('authenticated', 'public.saved_list_items', 'SELECT'),
  'raw saved-list rows are not directly browser readable'
);

select ok(
  not has_table_privilege('authenticated', 'public.saved_lists', 'INSERT')
  and not has_table_privilege('authenticated', 'public.saved_list_items', 'INSERT'),
  'browser users cannot bypass saved-list RPC authority'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'saved_lists_one_default_per_customer'
  ),
  'each customer can have only one default wishlist'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.saved_list_items'::regclass
      and conname = 'saved_list_items_unique'
  ),
  'a product cannot be duplicated within one saved list'
);

select ok(
  to_regprocedure('public.ensure_my_default_wishlist()') is not null,
  'default wishlist resolver exists'
);

select ok(
  position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.ensure_my_default_wishlist()'::regprocedure
    )
  ) > 0,
  'default wishlist requires TAKATAK-authorized session'
);

select ok(
  to_regprocedure('public.create_my_saved_list(text)') is not null
  and position(
    'Saved list limit reached'
    in pg_get_functiondef(
      'public.create_my_saved_list(text)'::regprocedure
    )
  ) > 0,
  'custom list creation is bounded'
);

select ok(
  to_regprocedure('public.rename_my_saved_list(uuid,text)') is not null
  and to_regprocedure('public.delete_my_saved_list(uuid)') is not null,
  'custom saved lists support rename and delete'
);

select ok(
  position(
    'AND is_default = false'
    in pg_get_functiondef(
      'public.delete_my_saved_list(uuid)'::regprocedure
    )
  ) > 0,
  'default wishlist cannot be deleted through custom-list deletion'
);

select ok(
  to_regprocedure('public.toggle_my_saved_product(uuid,uuid)') is not null,
  'saved product toggle RPC exists'
);

select ok(
  position(
    'v.subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.toggle_my_saved_product(uuid,uuid)'::regprocedure
    )
  ) > 0,
  'only live marketplace products can be newly saved'
);

select ok(
  to_regprocedure('public.merge_guest_wishlist(uuid[])') is not null,
  'guest wishlist merge RPC exists'
);

select ok(
  position(
    'Guest wishlist merge is limited to 250 products'
    in pg_get_functiondef(
      'public.merge_guest_wishlist(uuid[])'::regprocedure
    )
  ) > 0,
  'guest-to-account merge is bounded'
);

select ok(
  position(
    'ON CONFLICT (list_id, product_id) DO NOTHING'
    in pg_get_functiondef(
      'public.merge_guest_wishlist(uuid[])'::regprocedure
    )
  ) > 0,
  'guest wishlist merge is idempotent'
);

select ok(
  to_regprocedure('public.clear_my_saved_list(uuid)') is not null,
  'saved-list clear RPC exists'
);

select ok(
  to_regprocedure('public.list_my_saved_lists()') is not null
  and not has_function_privilege(
    'anon',
    'public.list_my_saved_lists()',
    'EXECUTE'
  ),
  'saved-list summaries are authenticated-only'
);

select ok(
  position(
    'sl.customer_id = auth.uid()'
    in pg_get_functiondef(
      'public.list_my_saved_lists()'::regprocedure
    )
  ) > 0,
  'saved-list summaries are customer scoped'
);

select ok(
  to_regprocedure('public.get_my_default_wishlist_ids()') is not null
  and not has_function_privilege(
    'anon',
    'public.get_my_default_wishlist_ids()',
    'EXECUTE'
  ),
  'default wishlist ids are authenticated-only'
);

select ok(
  to_regprocedure('public.list_my_saved_products(uuid,integer)') is not null,
  'saved products projection exists'
);

select ok(
  position(
    'p.status = ''active''::public.product_status'
    in pg_get_functiondef(
      'public.list_my_saved_products(uuid,integer)'::regprocedure
    )
  ) > 0
  and position(
    'v.subscription_status IN (''active'', ''trialing'')'
    in pg_get_functiondef(
      'public.list_my_saved_products(uuid,integer)'::regprocedure
    )
  ) > 0,
  'saved product projection only returns live marketplace inventory'
);

select ok(
  position(
    'RETURN;'
    in pg_get_functiondef(
      'public.list_my_saved_products(uuid,integer)'::regprocedure
    )
  ) > 0
  and position(
    'public.ensure_my_default_wishlist()'
    in pg_get_functiondef(
      'public.list_my_saved_products(uuid,integer)'::regprocedure
    )
  ) = 0,
  'saved-product reads do not create a wishlist as a side effect'
);

select ok(
  public.get_1lv_schema_version() >= '20261003044500',
  'persistent saved lists are present in the current production schema'
);

select * from finish();

rollback;
