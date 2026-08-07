
create type public.dispute_status as enum (
  'open','under_review','waiting_customer','waiting_vendor',
  'resolved_customer','resolved_vendor','rejected','cancelled'
);

create type public.refund_status as enum (
  'requested','approved','processing','refunded','failed','cancelled'
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  vendor_order_id uuid references public.vendor_orders(id) on delete set null,
  customer_id uuid,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  reason text not null,
  description text,
  status public.dispute_status not null default 'open',
  requested_refund_amount numeric not null default 0,
  approved_refund_amount numeric not null default 0,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index disputes_vendor_idx on public.disputes(vendor_id);
create index disputes_order_idx on public.disputes(order_id);
create index disputes_customer_idx on public.disputes(customer_id);
create unique index disputes_one_open_per_vendor_order
  on public.disputes(vendor_order_id)
  where status in ('open','under_review','waiting_customer','waiting_vendor');

create table public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  sender_user_id uuid,
  sender_role text not null default 'customer',
  message text not null,
  attachment_url text,
  internal_only boolean not null default false,
  created_at timestamptz not null default now()
);
create index dispute_messages_dispute_idx on public.dispute_messages(dispute_id);

create table public.refund_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  vendor_order_id uuid references public.vendor_orders(id) on delete set null,
  dispute_id uuid references public.disputes(id) on delete set null,
  amount numeric not null default 0,
  currency text not null default 'CAD',
  reason text,
  status public.refund_status not null default 'requested',
  stripe_refund_id text,
  failure_reason text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refund_records_order_idx on public.refund_records(order_id);
create index refund_records_dispute_idx on public.refund_records(dispute_id);
create unique index refund_records_stripe_unique on public.refund_records(stripe_refund_id) where stripe_refund_id is not null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  title text not null,
  body text,
  link text,
  dispute_id uuid references public.disputes(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- helpers
create or replace function public.owns_vendor(_vendor_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vendors v where v.id = _vendor_id and v.user_id = _user_id)
$$;

create or replace function public.can_access_dispute(_dispute_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.disputes d
    where d.id = _dispute_id
      and (
        d.customer_id = _user_id
        or public.owns_vendor(d.vendor_id, _user_id)
        or public.has_role(_user_id, 'admin')
      )
  )
$$;

grant select, insert on public.disputes to authenticated;
grant update on public.disputes to authenticated;
grant all on public.disputes to service_role;
alter table public.disputes enable row level security;

create policy "customers view own disputes" on public.disputes for select to authenticated
  using (customer_id = auth.uid());
create policy "vendors view their disputes" on public.disputes for select to authenticated
  using (public.owns_vendor(vendor_id, auth.uid()));
create policy "admins view all disputes" on public.disputes for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "customers open own disputes" on public.disputes for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid() and o.payment_status in ('paid','partially_refunded')
    )
  );
create policy "admins update disputes" on public.disputes for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select, insert on public.dispute_messages to authenticated;
grant all on public.dispute_messages to service_role;
alter table public.dispute_messages enable row level security;

create policy "participants read messages" on public.dispute_messages for select to authenticated
  using (
    public.can_access_dispute(dispute_id, auth.uid())
    and (internal_only = false or public.has_role(auth.uid(), 'admin'))
  );
create policy "participants post messages" on public.dispute_messages for insert to authenticated
  with check (
    sender_user_id = auth.uid()
    and public.can_access_dispute(dispute_id, auth.uid())
    and (internal_only = false or public.has_role(auth.uid(), 'admin'))
  );

grant select on public.refund_records to authenticated;
grant all on public.refund_records to service_role;
alter table public.refund_records enable row level security;

create policy "admins read refunds" on public.refund_records for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "customers read own refunds" on public.refund_records for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "vendors read their refunds" on public.refund_records for select to authenticated
  using (exists (select 1 from public.vendor_orders vo where vo.id = vendor_order_id and public.owns_vendor(vo.vendor_id, auth.uid())));

grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

create policy "users read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "users mark own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger disputes_touch before update on public.disputes
  for each row execute function public.touch_updated_at();
create trigger refund_records_touch before update on public.refund_records
  for each row execute function public.touch_updated_at();
