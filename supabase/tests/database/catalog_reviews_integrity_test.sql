begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select ok(
  exists (select 1 from pg_extension where extname = 'pg_trgm'),
  'pg_trgm is available for marketplace typo-tolerant search'
);

select ok(
  to_regclass('public.product_reviews') is not null,
  'verified product review table exists'
);

select ok(
  to_regtype('public.review_status') is not null,
  'review moderation status enum exists'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_reviews'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%order_item_id%'
  ),
  'one review is bound to each purchased order item'
);

select ok(
  not has_table_privilege('anon', 'public.product_reviews', 'SELECT')
  and not has_table_privilege('authenticated', 'public.product_reviews', 'SELECT'),
  'raw review rows are not directly readable by browser roles'
);

select ok(
  not has_table_privilege('authenticated', 'public.product_reviews', 'INSERT')
  and not has_table_privilege('authenticated', 'public.product_reviews', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.product_reviews', 'DELETE'),
  'browser users cannot bypass verified-review RPC authority'
);

select ok(
  to_regprocedure(
    'public.submit_verified_product_review(uuid,integer,text,text)'
  ) is not null,
  'verified review submission RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.submit_verified_product_review(uuid,integer,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.submit_verified_product_review(uuid,integer,text,text)',
    'EXECUTE'
  ),
  'only authenticated customers can submit reviews'
);

select ok(
  position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.submit_verified_product_review(uuid,integer,text,text)'::regprocedure
    )
  ) > 0,
  'review submission requires an exact TAKATAK-authorized session'
);

select ok(
  position(
    'v_item_status <> ''delivered'''
    in pg_get_functiondef(
      'public.submit_verified_product_review(uuid,integer,text,text)'::regprocedure
    )
  ) > 0
  and position(
    'v_payment_status NOT IN (''paid'', ''partially_refunded'')'
    in pg_get_functiondef(
      'public.submit_verified_product_review(uuid,integer,text,text)'::regprocedure
    )
  ) > 0,
  'review submission requires delivered retained paid purchase evidence'
);

select ok(
  to_regprocedure(
    'public.list_public_product_reviews(uuid,integer,integer)'
  ) is not null
  and has_function_privilege(
    'anon',
    'public.list_public_product_reviews(uuid,integer,integer)',
    'EXECUTE'
  ),
  'public review projection is available without exposing private rows'
);

select ok(
  to_regprocedure('public.get_public_product_review_summary(uuid)') is not null
  and has_function_privilege(
    'anon',
    'public.get_public_product_review_summary(uuid)',
    'EXECUTE'
  ),
  'public review summary is available to storefront clients'
);

select ok(
  to_regprocedure(
    'public.moderate_product_review(uuid,public.review_status)'
  ) is not null
  and not has_function_privilege(
    'anon',
    'public.moderate_product_review(uuid,public.review_status)',
    'EXECUTE'
  ),
  'review moderation is not public'
);

select ok(
  to_regprocedure(
    'public.search_public_catalog_products_v2(text,text,numeric,numeric,boolean,boolean,numeric,text,integer,integer)'
  ) is not null
  and has_function_privilege(
    'anon',
    'public.search_public_catalog_products_v2(text,text,numeric,numeric,boolean,boolean,numeric,text,integer,integer)',
    'EXECUTE'
  ),
  'marketplace search v2 is available to public storefront clients'
);

select ok(
  position(
    'websearch_to_tsquery'
    in pg_get_functiondef(
      'public.search_public_catalog_products_v2(text,text,numeric,numeric,boolean,boolean,numeric,text,integer,integer)'::regprocedure
    )
  ) > 0
  and position(
    'extensions.similarity'
    in pg_get_functiondef(
      'public.search_public_catalog_products_v2(text,text,numeric,numeric,boolean,boolean,numeric,text,integer,integer)'::regprocedure
    )
  ) > 0,
  'search v2 combines full-text relevance with typo tolerance'
);

select ok(
  position(
    'rating_average'
    in pg_get_functiondef(
      'public.search_public_catalog_products_v2(text,text,numeric,numeric,boolean,boolean,numeric,text,integer,integer)'::regprocedure
    )
  ) > 0
  and position(
    'min_rating'
    in pg_get_functiondef(
      'public.search_public_catalog_products_v2(text,text,numeric,numeric,boolean,boolean,numeric,text,integer,integer)'::regprocedure
    )
  ) > 0,
  'search v2 ranks and filters with verified review aggregates'
);

select * from finish();

rollback;
