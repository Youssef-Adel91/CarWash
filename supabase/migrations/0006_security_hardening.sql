-- =====================================================================
-- 0006_security_hardening.sql
-- Closes privilege-escalation and money-minting holes found while
-- reviewing 0000-0005 against the V2 design. Additive: it only drops and
-- recreates policies, adds triggers/functions, and adds platform_settings.
-- Run on a STAGING copy first. Safe to re-run.
--
-- What was wrong (all verified by tests/security_0006.sql):
--
--  1. wallets had an UPDATE policy, so any user could write their own
--     balance_piastres directly.
--  2. wallet_transactions allowed client INSERTs of any type, including
--     'topup' and 'refund', so any user could mint credit.
--  3. tenant_members INSERT only checked "role = 'owner' and user_id =
--     auth.uid()", so anyone could make themselves owner of ANY tenant;
--     the UPDATE policy let a worker rewrite their own role/rating.
--  4. wash_types write policy allowed tenant_id IS NULL rows for any
--     user, so anyone could edit the shared default catalog.
--  5. orders INSERT/UPDATE had no column restrictions, so a customer
--     could set their own price or status, and a worker could rewrite
--     any order of the tenant.
--  6. worker_locations INSERT did not check the order was assigned to
--     the caller, so anyone could squat another order's location row.
--  7. tenants UPDATE allowed an admin to reassign owner_id.
--
-- Contract after this migration:
--   * Money only moves through SECURITY DEFINER functions or the service
--     role (edge functions / webhooks). Clients cannot write wallets or
--     wallet_transactions at all.
--   * The service role (auth.uid() IS NULL) bypasses the guard triggers.
--
-- Not covered here (tracked for later phases): payments INSERT is still
-- client-writable (card path is mocked); min/max top-up and bonus tiers
-- come with the wallet-bundles migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. PLATFORM SETTINGS (key/value, jsonb). No secrets in here: every
--    row is readable by any signed-in user. Writes: service role only
--    until the platform-admin role exists.
-- ---------------------------------------------------------------------
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings for select
  to authenticated using (true);

-- Fail closed: the client-side "mock top-up" only works where this is
-- explicitly turned on (staging):
--   update public.platform_settings set value = 'true'
--   where key = 'payments.mock_topup_enabled';
insert into public.platform_settings (key, value, description) values
  ('payments.mock_topup_enabled', 'false'::jsonb,
   'Allow wallet_topup_mock() (instant fake top-up). Staging only; must stay false in production.')
on conflict (key) do nothing;

create or replace function public.platform_setting_bool(p_key text, p_default boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------
-- 1. WALLETS / LEDGER: clients can read, never write.
--    apply_wallet_transaction() is SECURITY DEFINER, so the ledger
--    trigger keeps working without these policies.
-- ---------------------------------------------------------------------
drop policy if exists "wallet_owner_update" on public.wallets;
drop policy if exists "wt_owner_insert" on public.wallet_transactions;

-- Instant fake top-up for staging. Production top-ups are inserted by the
-- payment webhook with the service role.
create or replace function public.wallet_topup_mock(p_amount_piastres bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not public.platform_setting_bool('payments.mock_topup_enabled', false) then
    raise exception 'Mock top-up is disabled' using errcode = '42501';
  end if;
  if p_amount_piastres is null or p_amount_piastres <= 0 then
    raise exception 'Amount must be positive' using errcode = '22023';
  end if;

  insert into public.wallet_transactions (user_id, type, amount_piastres, note)
  values (v_uid, 'topup', p_amount_piastres, 'Mock top-up');

  select balance_piastres into v_balance from public.wallets where user_id = v_uid;
  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. ORDERS
-- ---------------------------------------------------------------------

-- 2a. Price/name/status always come from the server on insert.
create or replace function public.enforce_order_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wt record;
begin
  if auth.uid() is null then
    return new; -- service role
  end if;

  select name, price_egp into v_wt
  from public.wash_types
  where id::text = new.wash_type_id
    and is_active
    and (tenant_id = new.tenant_id or tenant_id is null);
  if not found then
    raise exception 'Unknown or inactive wash type' using errcode = '22023';
  end if;

  new.wash_type_name := v_wt.name;
  new.price_egp := v_wt.price_egp;
  new.status := 'pending';
  new.worker_user_id := null;
  new.worker_name := null;
  new.worker_vehicle := null;
  new.worker_rating := null;
  return new;
end;
$$;

drop trigger if exists orders_enforce_insert on public.orders;
create trigger orders_enforce_insert
  before insert on public.orders
  for each row execute function public.enforce_order_insert();

-- 2b. Who may change what on an existing order.
create or replace function public.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old_rank int;
  v_new_rank int;
begin
  if v_uid is null then
    return new; -- service role
  end if;

  if new.customer_id <> old.customer_id
     or new.tenant_id is distinct from old.tenant_id
     or new.price_egp <> old.price_egp
     or new.wash_type_id is distinct from old.wash_type_id
     or new.wash_type_name <> old.wash_type_name
     or new.created_at <> old.created_at then
    raise exception 'customer, tenant, price, wash type and created_at are immutable'
      using errcode = '42501';
  end if;

  -- Tenant owner/admin: full control over status and assignment.
  if old.tenant_id is not null
     and public.is_tenant_member(old.tenant_id, array['owner','admin']) then
    return new;
  end if;

  -- Customer: may only cancel their own order while it is still pending
  -- (plus fix address/schedule). Fees for later cancellations come with
  -- the cancellation-policy migration, via a SECURITY DEFINER function.
  if v_uid = old.customer_id then
    if old.status = 'pending'
       and new.status in ('pending', 'cancelled')
       and new.worker_user_id is not distinct from old.worker_user_id
       and new.worker_name is not distinct from old.worker_name
       and new.worker_vehicle is not distinct from old.worker_vehicle
       and new.worker_rating is not distinct from old.worker_rating then
      return new;
    end if;
    raise exception 'Customers can only cancel a pending order' using errcode = '42501';
  end if;

  -- Worker claiming an open order.
  if old.worker_user_id is null then
    if old.status = 'pending'
       and new.status = 'accepted'
       and new.worker_user_id = v_uid
       and old.tenant_id is not null
       and public.is_tenant_member(old.tenant_id, array['worker']) then
      return new;
    end if;
    raise exception 'Not allowed to modify this order' using errcode = '42501';
  end if;

  -- Assigned worker: forward-only status changes, assignment is frozen.
  if old.worker_user_id = v_uid then
    if new.worker_user_id is distinct from old.worker_user_id then
      raise exception 'Cannot reassign the order' using errcode = '42501';
    end if;
    v_old_rank := case old.status
      when 'pending' then 0 when 'accepted' then 1 when 'on_the_way' then 2
      when 'washing' then 3 when 'completed' then 4 end;
    v_new_rank := case new.status
      when 'pending' then 0 when 'accepted' then 1 when 'on_the_way' then 2
      when 'washing' then 3 when 'completed' then 4 end;
    if new.status = old.status
       or (v_old_rank is not null and v_new_rank is not null and v_new_rank > v_old_rank) then
      return new;
    end if;
    raise exception 'Invalid status transition % -> %', old.status, new.status
      using errcode = '42501';
  end if;

  raise exception 'Not allowed to modify this order' using errcode = '42501';
end;
$$;

drop trigger if exists orders_guard_update on public.orders;
create trigger orders_guard_update
  before update on public.orders
  for each row execute function public.guard_order_update();

-- 2c. Atomic "create order + pay from wallet". Price is read from
--     wash_types, never from the client. If the debit fails (balance too
--     low) the whole call rolls back and no order is left behind.
create or replace function public.place_order_with_wallet(
  p_tenant_id uuid,
  p_wash_type_id text,
  p_lat double precision,
  p_lng double precision,
  p_address text,
  p_scheduled_for timestamptz
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id and is_active) then
    raise exception 'Unknown or inactive tenant' using errcode = '22023';
  end if;

  -- orders_enforce_insert overrides price/name/status from wash_types.
  insert into public.orders
    (customer_id, tenant_id, wash_type_id, wash_type_name, price_egp, status,
     lat, lng, address, scheduled_for)
  values
    (v_uid, p_tenant_id, p_wash_type_id, '', 0, 'pending',
     p_lat, p_lng, p_address, p_scheduled_for)
  returning * into v_order;

  insert into public.wallet_transactions (user_id, type, amount_piastres, order_id, note)
  values (v_uid, 'order_debit', round(v_order.price_egp * 100)::bigint, v_order.id,
          'Order payment');

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. TENANT MEMBERS
-- ---------------------------------------------------------------------
drop policy if exists tenant_members_insert on public.tenant_members;
create policy tenant_members_insert on public.tenant_members for insert
  with check (
    -- the creator of a tenant becomes its owner (createTenant)
    (role = 'owner'
      and user_id = auth.uid()
      and exists (select 1 from public.tenants t where t.id = tenant_id and t.owner_id = auth.uid()))
    -- owners/admins add workers; only owners add admins
    or (role = 'worker' and public.is_tenant_member(tenant_id, array['owner','admin']))
    or (role = 'admin' and public.is_tenant_member(tenant_id, array['owner']))
  );

drop policy if exists tenant_members_delete on public.tenant_members;
create policy tenant_members_delete on public.tenant_members for delete
  using (role <> 'owner' and public.is_tenant_member(tenant_id, array['owner','admin']));

create or replace function public.guard_tenant_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_is_staff boolean;
begin
  if v_uid is null then
    return new; -- service role
  end if;

  if new.tenant_id <> old.tenant_id
     or new.user_id <> old.user_id
     or new.created_at <> old.created_at then
    raise exception 'tenant_id, user_id and created_at are immutable' using errcode = '42501';
  end if;

  v_is_owner := public.is_tenant_member(old.tenant_id, array['owner']);
  v_is_staff := public.is_tenant_member(old.tenant_id, array['owner','admin']);

  if old.role = 'owner' and v_uid <> old.user_id then
    raise exception 'Only the owner can edit the owner membership' using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    if not v_is_owner or old.role = 'owner' or new.role = 'owner' then
      raise exception 'Only the owner can change roles, and ownership cannot be reassigned here'
        using errcode = '42501';
    end if;
  end if;

  -- Members may only toggle their own online flag / vehicle.
  if not v_is_staff
     and (new.is_active is distinct from old.is_active
          or new.rating is distinct from old.rating) then
    raise exception 'Not allowed to change is_active or rating' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tenant_members_guard_update on public.tenant_members;
create trigger tenant_members_guard_update
  before update on public.tenant_members
  for each row execute function public.guard_tenant_member_update();

-- ---------------------------------------------------------------------
-- 4. TENANTS: owner_id is not editable by tenant staff.
-- ---------------------------------------------------------------------
create or replace function public.guard_tenant_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.owner_id <> old.owner_id then
    raise exception 'owner_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists tenants_guard_update on public.tenants;
create trigger tenants_guard_update
  before update on public.tenants
  for each row execute function public.guard_tenant_update();

-- ---------------------------------------------------------------------
-- 5. WASH TYPES: the shared catalog (tenant_id IS NULL) is read-only for
--    clients; each tenant manages only its own rows.
-- ---------------------------------------------------------------------
drop policy if exists wash_types_write on public.wash_types;
create policy wash_types_write on public.wash_types for all
  using (tenant_id is not null and public.is_tenant_member(tenant_id, array['owner','admin']))
  with check (tenant_id is not null and public.is_tenant_member(tenant_id, array['owner','admin']));

-- ---------------------------------------------------------------------
-- 6. WORKER LOCATIONS: only the worker assigned to that order, in that
--    tenant, can write its location row.
-- ---------------------------------------------------------------------
drop policy if exists worker_locations_upsert on public.worker_locations;
create policy worker_locations_upsert on public.worker_locations for insert
  with check (
    worker_user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = worker_locations.order_id
        and o.worker_user_id = auth.uid()
        and o.tenant_id = worker_locations.tenant_id
    )
  );

drop policy if exists worker_locations_update on public.worker_locations;
create policy worker_locations_update on public.worker_locations for update
  using (worker_user_id = auth.uid())
  with check (
    worker_user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = worker_locations.order_id
        and o.worker_user_id = auth.uid()
        and o.tenant_id = worker_locations.tenant_id
    )
  );

-- ---------------------------------------------------------------------
-- 7. FUNCTION PRIVILEGES: callable by signed-in users only.
-- ---------------------------------------------------------------------
revoke all on function public.wallet_topup_mock(bigint) from public, anon;
revoke all on function public.place_order_with_wallet(uuid, text, double precision, double precision, text, timestamptz) from public, anon;
grant execute on function public.wallet_topup_mock(bigint) to authenticated;
grant execute on function public.place_order_with_wallet(uuid, text, double precision, double precision, text, timestamptz) to authenticated;
