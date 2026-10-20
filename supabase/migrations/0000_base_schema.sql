-- =====================================================================
-- SplashGo — base schema
-- Run this FIRST on a brand-new/empty Supabase project (before
-- 0001_saas_multitenant.sql). The original app was built on "OnSpace
-- Cloud", which auto-provisioned these tables + the signup trigger behind
-- the scenes — moving to your own plain Supabase project means none of
-- that exists yet, so this file recreates it from what the app code
-- actually reads/writes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. USER PROFILES — one row per auth.users row, auto-created on signup.
-- ---------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  card_last4 text,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select on public.user_profiles;
create policy user_profiles_select on public.user_profiles for select
  using (id = auth.uid());

drop policy if exists user_profiles_update on public.user_profiles;
create policy user_profiles_update on public.user_profiles for update
  using (id = auth.uid());

-- Auto-create the profile row the moment someone signs up (authService
-- relies on this row already existing so it can .update() it after OTP
-- verification).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. WASH TYPES — the service catalog (tenant_id added by 0001).
-- ---------------------------------------------------------------------
create table if not exists public.wash_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_egp numeric not null,
  duration_min integer not null default 30,
  icon text default 'car-wash',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.wash_types enable row level security;

drop policy if exists wash_types_select on public.wash_types;
create policy wash_types_select on public.wash_types for select using (true);

-- Seed the same 3 default services the app ships with as a fallback
-- (tenant_id stays null — every tenant can see/copy these to start).
insert into public.wash_types (name, description, price_egp, duration_min, icon, sort_order)
select * from (values
  ('Exterior Only', 'Foam wash, rinse and dry of the car body.', 80, 20, 'car-wash', 1),
  ('Interior + Exterior', 'Full inside vacuum and complete outside clean.', 150, 40, 'car-seat', 2),
  ('Premium / Wax Detailing', 'Deep detailing, polish and protective wax coat.', 300, 75, 'shimmer', 3)
) as seed(name, description, price_egp, duration_min, icon, sort_order)
where not exists (select 1 from public.wash_types);

-- ---------------------------------------------------------------------
-- 3. ORDERS (tenant_id / worker_user_id added by 0001).
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  wash_type_id text,
  wash_type_name text not null,
  price_egp numeric not null,
  status text not null default 'pending',
  lat double precision,
  lng double precision,
  address text,
  scheduled_for timestamptz,
  worker_name text,
  worker_vehicle text,
  worker_rating numeric,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders for select
  using (customer_id = auth.uid());

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders for insert
  with check (customer_id = auth.uid());

drop policy if exists orders_update_own on public.orders;
create policy orders_update_own on public.orders for update
  using (customer_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. PAYMENTS (tenant_id / provider / provider_ref added by 0001).
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  kind text not null,
  amount_egp numeric not null,
  currency text not null default 'EGP',
  status text not null default 'succeeded',
  card_last4 text,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments for select
  using (user_id = auth.uid());

drop policy if exists payments_insert_own on public.payments;
create policy payments_insert_own on public.payments for insert
  with check (user_id = auth.uid());

-- =====================================================================
-- Next: run 0001_saas_multitenant.sql in the same SQL editor to add
-- tenants / tenant_members / worker_locations and extend the tables
-- above with tenant_id + worker_user_id + RLS for the multi-tenant model.
-- =====================================================================
