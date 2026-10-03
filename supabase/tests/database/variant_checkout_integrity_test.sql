begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select ok(
  position(
    'variant_id'
    in pg_get_functiondef(
      'public.assert_checkout_items_safe(jsonb)'::regprocedure
    )
  ) > 0,
  'checkout validation understands optional variant ids'
);

select lives_ok(
  $sql$
    select public.assert_checkout_items_safe(
      '[{"product_id":"11111111-1111-4111-8111-111111111111","variant_id":"22222222-2222-4222-8222-222222222222","quantity":2}]'::jsonb
    )
  $sql$,
  'valid product plus variant checkout shape is accepted'
);

select throws_ok(
  $sql$
    select public.assert_checkout_items_safe(
      '[{"product_id":"11111111-1111-4111-8111-111111111111","variant_id":"not-a-uuid","quantity":1}]'::jsonb
    )
  $sql$,
  '22023',
  'Each checkout item must have a valid product, optional variant and quantity',
  'malformed variant ids fail before UUID casts'
);

select ok(
  position(
    'NULLIF(entry->>''variant_id'', '''')::uuid'
    in pg_get_functiondef(
      'public.create_marketplace_order_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'checkout core groups cart lines by product and exact variant'
);

select ok(
  position(
    'v_unit_price := v_variant.price'
    in pg_get_functiondef(
      'public.create_marketplace_order_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'variant price comes from PostgreSQL'
);

select ok(
  position(
    'v_variant.inventory_quantity < v_item.quantity'
    in pg_get_functiondef(
      'public.create_marketplace_order_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'variant stock is checked server side'
);

select ok(
  position(
    'UPDATE public.product_variants'
    in pg_get_functiondef(
      'public.create_marketplace_order_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'variant stock is reserved from the SKU row'
);

select ok(
  position(
    'variant_sku'
    in pg_get_functiondef(
      'public.create_marketplace_order_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'variant_options'
    in pg_get_functiondef(
      'public.create_marketplace_order_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'order items snapshot SKU and option labels'
);

select ok(
  position(
    'A product variant must be selected'
    in pg_get_functiondef(
      'public.create_marketplace_order_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'variantized products cannot fall back to parent pricing'
);

select ok(
  position(
    '''variant_id'', variant_id'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'idempotency fingerprint includes exact variant identity'
);

select ok(
  position(
    'hashtextextended(v_product_id::text, 42117)'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'checkout still locks products deterministically'
);

select ok(
  position(
    'hashtextextended(v_variant_id::text, 42118)'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked_unchecked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'checkout locks variants deterministically'
);

select ok(
  position(
    'variant_id IS NOT NULL'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'UPDATE public.product_variants'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0,
  'expired SKU reservations restore variant stock'
);

select ok(
  position(
    'variant_id IS NULL'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'UPDATE public.products'
    in pg_get_functiondef(
      'public.release_order_inventory(uuid,text)'::regprocedure
    )
  ) > 0,
  'non-variant reservations still restore parent stock'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)',
    'EXECUTE'
  ),
  'canonical locked checkout remains service-role only'
);

select ok(
  position(
    'public.create_marketplace_order_locked_unchecked'
    in pg_get_functiondef(
      'public.create_marketplace_order_locked(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'canonical checkout wrapper still delegates through the protected lock layer'
);

select ok(
  position(
    'public.recalculate_new_checkout_tax(v_order_id)'
    in pg_get_functiondef(
      'public.create_marketplace_order(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'variant checkout preserves taxable-delivery recalculation'
);

select ok(
  public.get_1lv_schema_version() >= '20261003024500',
  'variant checkout remains present in the current production schema'
);

select * from finish();

rollback;
