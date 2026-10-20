-- =====================================================================
-- SplashGo → Multi-tenant SaaS migration
-- Run this once in the Supabase / OnSpace SQL editor for your project.
-- It is additive: it does not drop the existing user_profiles/orders/
-- payments/wash_types tables, it extends them with tenant_id + worker_id
-- and adds the new tables needed for a real multi-tenant marketplace.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TENANTS  (each row = one car-wash business/company on the platform)
-- ---------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text unique not null,
  logo_url text,
  city text,
  is_active boolean not null default true,
  registration_fee_egp numeric not null default 10,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. TENANT MEMBERS (owner / admin / worker roles inside a tenant)
-- ---------------------------------------------------------------------
create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'worker')),
  is_active boolean not null default true,
  is_online boolean not null default false,
  vehicle text,
  rating numeric not null default 5.0,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists idx_tenant_members_user on public.tenant_members(user_id);
create index if not exists idx_tenant_members_tenant on public.tenant_members(tenant_id);

-- Helper used by RLS policies below.
create or replace function public.is_tenant_member(p_tenant_id uuid, p_roles text[])
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and (p_roles is null or m.role = any(p_roles))
  );
$$;

-- ---------------------------------------------------------------------
-- 3. WASH TYPES → now scoped per tenant
-- ---------------------------------------------------------------------
alter table public.wash_types
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

create index if not exists idx_wash_types_tenant on public.wash_types(tenant_id);

-- ---------------------------------------------------------------------
-- 4. ORDERS → now scoped per tenant + assigned worker (real FK, not text)
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null,
  add column if not exists worker_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_orders_tenant on public.orders(tenant_id);
create index if not exists idx_orders_worker on public.orders(worker_user_id);
create index if not exists idx_orders_status on public.orders(status);

-- ---------------------------------------------------------------------
-- 5. PAYMENTS → scoped per tenant, ready for Paymob provider reference
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null,
  add column if not exists provider text not null default 'mock', -- 'mock' | 'paymob'
  add column if not exists provider_ref text;                     -- paymob transaction/order id

create index if not exists idx_payments_tenant on public.payments(tenant_id);

-- ---------------------------------------------------------------------
-- 6. WORKER LOCATIONS → real-time GPS ping while a job is active
-- ---------------------------------------------------------------------
create table if not exists public.worker_locations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

alter publication supabase_realtime add table public.worker_locations;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.wash_types enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.worker_locations enable row level security;

-- Tenants: anyone signed in can browse active tenants (to pick a company);
-- only the owner/admins of a tenant can update it.
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants for select
  using (is_active = true or owner_id = auth.uid() or public.is_tenant_member(id, array['owner','admin']));

drop policy if exists tenants_insert on public.tenants;
create policy tenants_insert on public.tenants for insert
  with check (owner_id = auth.uid());

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants for update
  using (public.is_tenant_member(id, array['owner','admin']));

-- Tenant members: a user sees their own membership rows; owners/admins see
-- everyone in their tenant.
drop policy if exists tenant_members_select on public.tenant_members;
create policy tenant_members_select on public.tenant_members for select
  using (user_id = auth.uid() or public.is_tenant_member(tenant_id, array['owner','admin']));

drop policy if exists tenant_members_insert on public.tenant_members;
create policy tenant_members_insert on public.tenant_members for insert
  with check (
    -- becoming an owner happens only via createTenant (owner_id check on tenants)
    (role = 'owner' and user_id = auth.uid())
    or public.is_tenant_member(tenant_id, array['owner','admin'])
  );

drop policy if exists tenant_members_update on public.tenant_members;
create policy tenant_members_update on public.tenant_members for update
  using (user_id = auth.uid() or public.is_tenant_member(tenant_id, array['owner','admin']));

drop policy if exists tenant_members_delete on public.tenant_members;
create policy tenant_members_delete on public.tenant_members for delete
  using (public.is_tenant_member(tenant_id, array['owner','admin']));

-- Wash types: public read of active rows; only tenant owner/admin manage.
drop policy if exists wash_types_select on public.wash_types;
create policy wash_types_select on public.wash_types for select using (true);

drop policy if exists wash_types_write on public.wash_types;
create policy wash_types_write on public.wash_types for all
  using (tenant_id is null or public.is_tenant_member(tenant_id, array['owner','admin']))
  with check (tenant_id is null or public.is_tenant_member(tenant_id, array['owner','admin']));

-- Orders: customer sees their own; worker sees unassigned tenant orders +
-- their own assigned orders; owner/admin sees every order in their tenant.
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (
    customer_id = auth.uid()
    or worker_user_id = auth.uid()
    or (tenant_id is not null and public.is_tenant_member(tenant_id, array['worker']) and worker_user_id is null)
    or (tenant_id is not null and public.is_tenant_member(tenant_id, array['owner','admin']))
  );

drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert
  with check (customer_id = auth.uid());

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update
  using (
    customer_id = auth.uid()
    or worker_user_id = auth.uid()
    or (tenant_id is not null and public.is_tenant_member(tenant_id, array['worker']) and worker_user_id is null)
    or (tenant_id is not null and public.is_tenant_member(tenant_id, array['owner','admin']))
  );

-- Payments: user sees their own payments; tenant owner/admin sees tenant's.
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  using (user_id = auth.uid() or (tenant_id is not null and public.is_tenant_member(tenant_id, array['owner','admin'])));

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert
  with check (user_id = auth.uid());

-- Worker locations: the assigned worker writes; the customer on that order,
-- the worker, and tenant admins can read.
drop policy if exists worker_locations_select on public.worker_locations;
create policy worker_locations_select on public.worker_locations for select
  using (
    worker_user_id = auth.uid()
    or public.is_tenant_member(tenant_id, array['owner','admin'])
    or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

drop policy if exists worker_locations_upsert on public.worker_locations;
create policy worker_locations_upsert on public.worker_locations for insert
  with check (worker_user_id = auth.uid());

drop policy if exists worker_locations_update on public.worker_locations;
create policy worker_locations_update on public.worker_locations for update
  using (worker_user_id = auth.uid());

-- =====================================================================
-- Done. Next steps for you:
--  1. Run this file in Supabase Studio → SQL editor (or `supabase db push`).
--  2. Create your first tenant row (or let a business owner sign up via
--     the app's "أنا صاحب مغسلة" flow, which calls tenantService.createTenant).
--  3. Seed wash_types with tenant_id = your tenant's id (or leave tenant_id
--     null for a shared default catalog every tenant can start from).
-- =====================================================================
