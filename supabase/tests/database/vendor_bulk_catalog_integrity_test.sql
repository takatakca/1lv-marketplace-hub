begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

select ok(
  to_regtype('public.vendor_catalog_audit_kind') is not null,
  'vendor catalog audit kind enum exists'
);

select ok(
  to_regclass('public.vendor_catalog_audit_events') is not null,
  'vendor catalog audit table exists'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_catalog_audit_events'
      and policyname = 'TAKATAK authenticated sessions only'
      and permissive = 'RESTRICTIVE'
  ),
  'catalog audit table has restrictive TAKATAK session gate'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.vendor_catalog_audit_events',
    'INSERT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.vendor_catalog_audit_events',
    'UPDATE'
  ),
  'browser vendors cannot write audit history directly'
);

select ok(
  not has_table_privilege(
    'service_role',
    'public.vendor_catalog_audit_events',
    'UPDATE'
  )
  and not has_table_privilege(
    'service_role',
    'public.vendor_catalog_audit_events',
    'DELETE'
  ),
  'catalog audit history is append-only'
);

select ok(
  to_regprocedure('public.require_vendor_catalog_authority(uuid)') is not null,
  'vendor catalog authority helper exists'
);

select ok(
  position(
    'public.is_takatak_authorized_session()'
    in pg_get_functiondef(
      'public.require_vendor_catalog_authority(uuid)'::regprocedure
    )
  ) > 0,
  'catalog authority requires exact TAKATAK session'
);

select ok(
  position(
    'Vendor catalog access denied'
    in pg_get_functiondef(
      'public.require_vendor_catalog_authority(uuid)'::regprocedure
    )
  ) > 0,
  'catalog authority checks vendor ownership'
);

select ok(
  to_regprocedure(
    'public.bulk_set_vendor_product_status(uuid,uuid[],public.product_status)'
  ) is not null,
  'atomic bulk product status RPC exists'
);

select ok(
  position(
    '1 to 500 products'
    in pg_get_functiondef(
      'public.bulk_set_vendor_product_status(uuid,uuid[],public.product_status)'::regprocedure
    )
  ) > 0,
  'bulk status batch is bounded'
);

select ok(
  position(
    'duplicate product ids'
    in pg_get_functiondef(
      'public.bulk_set_vendor_product_status(uuid,uuid[],public.product_status)'::regprocedure
    )
  ) > 0,
  'bulk status rejects duplicate targets'
);

select ok(
  position(
    'One or more products do not belong to this vendor'
    in pg_get_functiondef(
      'public.bulk_set_vendor_product_status(uuid,uuid[],public.product_status)'::regprocedure
    )
  ) > 0,
  'bulk status rejects cross-vendor products'
);

select ok(
  position(
    'Vendor must be active with an active subscription before review'
    in pg_get_functiondef(
      'public.bulk_set_vendor_product_status(uuid,uuid[],public.product_status)'::regprocedure
    )
  ) > 0,
  'bulk review submission verifies vendor commercial eligibility'
);

select ok(
  position(
    'require_product_approval'
    in pg_get_functiondef(
      'public.bulk_set_vendor_product_status(uuid,uuid[],public.product_status)'::regprocedure
    )
  ) > 0,
  'bulk review submission respects marketplace approval settings'
);

select ok(
  position(
    'ORDER BY id'
    in pg_get_functiondef(
      'public.bulk_set_vendor_product_status(uuid,uuid[],public.product_status)'::regprocedure
    )
  ) > 0
  and position(
    'FOR UPDATE'
    in pg_get_functiondef(
      'public.bulk_set_vendor_product_status(uuid,uuid[],public.product_status)'::regprocedure
    )
  ) > 0,
  'bulk status locks products deterministically'
);

select ok(
  to_regprocedure(
    'public.bulk_adjust_vendor_inventory(uuid,jsonb)'
  ) is not null,
  'atomic bulk inventory RPC exists'
);

select ok(
  position(
    '1 to 1000 entries'
    in pg_get_functiondef(
      'public.bulk_adjust_vendor_inventory(uuid,jsonb)'::regprocedure
    )
  ) > 0,
  'bulk inventory batch is bounded'
);

select ok(
  position(
    'duplicate product/SKU targets'
    in pg_get_functiondef(
      'public.bulk_adjust_vendor_inventory(uuid,jsonb)'::regprocedure
    )
  ) > 0,
  'bulk inventory rejects duplicate SKU targets'
);

select ok(
  position(
    'Inventory target SKU does not belong to vendor product'
    in pg_get_functiondef(
      'public.bulk_adjust_vendor_inventory(uuid,jsonb)'::regprocedure
    )
  ) > 0,
  'bulk inventory verifies SKU ownership'
);

select ok(
  position(
    'Variantized product inventory must target an exact SKU'
    in pg_get_functiondef(
      'public.bulk_adjust_vendor_inventory(uuid,jsonb)'::regprocedure
    )
  ) > 0,
  'bulk inventory cannot bypass SKU-level stock'
);

select ok(
  position(
    'inventory result is outside allowed bounds'
    in lower(
      pg_get_functiondef(
        'public.bulk_adjust_vendor_inventory(uuid,jsonb)'::regprocedure
      )
    )
  ) > 0,
  'bulk inventory blocks negative or unbounded stock'
);

select ok(
  position(
    'ORDER BY'
    in pg_get_functiondef(
      'public.bulk_adjust_vendor_inventory(uuid,jsonb)'::regprocedure
    )
  ) > 0
  and position(
    'FOR UPDATE'
    in pg_get_functiondef(
      'public.bulk_adjust_vendor_inventory(uuid,jsonb)'::regprocedure
    )
  ) > 0,
  'bulk inventory uses deterministic locked mutation order'
);

select ok(
  position(
    'vendor_catalog_audit_events'
    in pg_get_functiondef(
      'public.bulk_adjust_vendor_inventory(uuid,jsonb)'::regprocedure
    )
  ) > 0
  and position(
    'vendor_catalog_audit_events'
    in pg_get_functiondef(
      'public.bulk_set_vendor_product_status(uuid,uuid[],public.product_status)'::regprocedure
    )
  ) > 0,
  'both bulk mutation families emit audit events'
);

select ok(
  to_regprocedure(
    'public.get_vendor_inventory_snapshot(uuid,integer,integer)'
  ) is not null
  and not has_function_privilege(
    'anon',
    'public.get_vendor_inventory_snapshot(uuid,integer,integer)',
    'EXECUTE'
  ),
  'vendor inventory snapshot is protected'
);

select ok(
  to_regprocedure(
    'public.list_vendor_catalog_audit_events(uuid,integer)'
  ) is not null
  and not has_function_privilege(
    'anon',
    'public.list_vendor_catalog_audit_events(uuid,integer)',
    'EXECUTE'
  ),
  'vendor audit projection is protected'
);

select ok(
  public.get_1lv_schema_version() >= '20261003052000',
  'vendor bulk operations are present in current production schema'
);

select * from finish();

rollback;
