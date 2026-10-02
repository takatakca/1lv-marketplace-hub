begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_marketplace_order(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)',
    'EXECUTE'
  ),
  'browser-authenticated users cannot execute the financial checkout RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_marketplace_order(uuid,text,text,jsonb,jsonb,jsonb,uuid,text)',
    'EXECUTE'
  ),
  'service role can execute the trusted checkout transaction'
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
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'Checkout Test Vendor',
  'checkout-test-vendor',
  'active'::public.vendor_status,
  'active'
);

set local session_replication_role = origin;

insert into public.products (
  id,
  vendor_id,
  slug,
  title,
  category_slug,
  price,
  compare_at_price,
  inventory_quantity,
  track_inventory,
  images,
  status
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'checkout-live-product',
  'Checkout Live Product',
  'tests',
  10,
  12,
  5,
  true,
  '["https://example.invalid/checkout.jpg"]'::jsonb,
  'active'::public.product_status
);

select lives_ok(
  $checkout$
    select public.create_marketplace_order(
      null,
      'checkout-test@example.invalid',
      '+15145551234',
      '{
        "first_name":"Checkout",
        "last_name":"Test",
        "address":"123 Test Street",
        "city":"Montreal",
        "province":"QC",
        "postal_code":"H2H2H2",
        "country":"Canada"
      }'::jsonb,
      null,
      jsonb_build_array(
        jsonb_build_object(
          'product_id',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'quantity',
          2
        )
      ),
      '44444444-4444-4444-8444-444444444444'::uuid,
      null
    )
  $checkout$,
  'server-authoritative guest checkout creates a live order'
);

select is(
  (
    select subtotal
    from public.orders
    where customer_email = 'checkout-test@example.invalid'
  ),
  20.00::numeric,
  'checkout subtotal is recalculated from stored product price'
);

select is(
  (
    select total
    from public.orders
    where customer_email = 'checkout-test@example.invalid'
  ),
  30.99::numeric,
  'checkout total uses persisted shipping plus Quebec tax'
);

select is(
  (
    select inventory_quantity
    from public.products
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
  ),
  3,
  'checkout reserves inventory exactly once'
);

select is(
  (
    public.create_marketplace_order(
      null,
      'checkout-test@example.invalid',
      '+15145551234',
      '{
        "first_name":"Checkout",
        "last_name":"Test",
        "address":"123 Test Street",
        "city":"Montreal",
        "province":"QC",
        "postal_code":"H2H2H2",
        "country":"Canada"
      }'::jsonb,
      null,
      jsonb_build_array(
        jsonb_build_object(
          'product_id',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'quantity',
          2
        )
      ),
      '44444444-4444-4444-8444-444444444444'::uuid,
      null
    ) ->> 'reused'
  )::boolean,
  true,
  'repeating the same checkout key reuses the original order'
);

select ok(
  (
    select public.lookup_guest_order(
      o.order_number,
      '44444444-4444-4444-8444-444444444444'::uuid
    )
    from public.orders as o
    where o.customer_email = 'checkout-test@example.invalid'
  ) is not null
  and (
    select public.lookup_guest_order(
      o.order_number,
      '55555555-5555-4555-8555-555555555555'::uuid
    )
    from public.orders as o
    where o.customer_email = 'checkout-test@example.invalid'
  ) is null,
  'guest order lookup requires the original high-entropy checkout capability'
);

select * from finish();

rollback;
