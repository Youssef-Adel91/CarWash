-- Attack tests for 0006_security_hardening.sql.
-- Run against a scratch database after applying supabase_stub.sql and
-- migrations 0000..0006 (see run_local.sh). Every check either asserts a
-- statement is denied or asserts a state afterwards; a failed assertion
-- aborts the script with "FAIL ...".

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create or replace function t_denied(p_label text, p_sql text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'PASS denied : % -- %', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL (was allowed): %', p_label;
end $$;

create or replace function t_ok(p_label text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise notice 'PASS allowed: %', p_label;
exception when others then
  raise exception 'FAIL (was denied): % -- %', p_label, sqlerrm;
end $$;

-- UPDATE/DELETE that must affect exactly p_rows rows (RLS may hide rows silently).
create or replace function t_rows(p_label text, p_sql text, p_rows int) returns void
language plpgsql as $$
declare c int;
begin
  execute 'with x as (' || p_sql || ' returning 1) select count(*) from x' into c;
  if c <> p_rows then
    raise exception 'FAIL: % affected % rows, expected %', p_label, c, p_rows;
  end if;
  raise notice 'PASS rows=%  : %', c, p_label;
end $$;

create or replace function t_eq(p_label text, p_actual text, p_expected text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % got [%] expected [%]', p_label, p_actual, p_expected;
  end if;
  raise notice 'PASS equals : % = %', p_label, p_expected;
end $$;

create or replace function t_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, false);
end $$;

-- ---------------------------------------------------------------------
-- Fixtures (as superuser)
-- ---------------------------------------------------------------------
\set owner  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set worker '''aaaaaaaa-0000-0000-0000-000000000002'''
\set cust   '''aaaaaaaa-0000-0000-0000-000000000003'''
\set cust2  '''aaaaaaaa-0000-0000-0000-000000000004'''
\set evil   '''aaaaaaaa-0000-0000-0000-000000000005'''
\set worker2 '''aaaaaaaa-0000-0000-0000-000000000006'''
\set owner2 '''aaaaaaaa-0000-0000-0000-000000000007'''

insert into auth.users (id, email) values
  (:owner,  'owner@t.test'),  (:worker, 'worker@t.test'), (:cust, 'cust@t.test'),
  (:cust2,  'cust2@t.test'),  (:evil,   'evil@t.test'),   (:worker2, 'worker2@t.test'),
  (:owner2, 'owner2@t.test');

insert into public.tenants (id, owner_id, name, slug)
values ('bbbbbbbb-0000-0000-0000-000000000001', :owner,  'Tenant One', 'tenant-one'),
       ('bbbbbbbb-0000-0000-0000-000000000002', :owner2, 'Tenant Two', 'tenant-two');
insert into public.tenant_members (tenant_id, user_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', :owner,  'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000001', :worker, 'worker'),
  ('bbbbbbbb-0000-0000-0000-000000000002', :owner2, 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', :worker2, 'worker');

insert into public.wash_types (id, tenant_id, name, price_egp)
values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Full', 150);
select id as shared_wt from public.wash_types where tenant_id is null limit 1 \gset

-- ---------------------------------------------------------------------
-- 1. Wallet: no direct writes, mock top-up gated by platform_settings
-- ---------------------------------------------------------------------
select t_as(:cust);
set role authenticated;

select t_rows('customer cannot UPDATE own wallet balance',
  $$update public.wallets set balance_piastres = 999999999 where user_id = auth.uid()$$, 0);
select t_denied('customer cannot INSERT a topup',
  $$insert into public.wallet_transactions (user_id, type, amount_piastres) values (auth.uid(), 'topup', 100000)$$);
select t_denied('customer cannot INSERT a refund',
  $$insert into public.wallet_transactions (user_id, type, amount_piastres) values (auth.uid(), 'refund', 100000)$$);
select t_denied('mock top-up is off by default', $$select public.wallet_topup_mock(10000)$$);
select t_rows('customer cannot flip platform_settings',
  $$update public.platform_settings set value = 'true' where key = 'payments.mock_topup_enabled'$$, 0);
select set_config('request.jwt.claim.sub', '', false);
select t_denied('no user (null uid) cannot call mock top-up', $$select public.wallet_topup_mock(1)$$);
reset role;
select t_eq('wallet untouched', (select balance_piastres::text from public.wallets where user_id = :cust), '0');

update public.platform_settings set value = 'true' where key = 'payments.mock_topup_enabled';
select t_as(:cust);
set role authenticated;
select t_eq('mock top-up credits wallet', public.wallet_topup_mock(20000)::text, '20000');
select t_denied('mock top-up rejects zero', $$select public.wallet_topup_mock(0)$$);
select t_denied('mock top-up rejects negative', $$select public.wallet_topup_mock(-5)$$);

-- ---------------------------------------------------------------------
-- 2. Orders: price from server, atomic wallet payment
-- ---------------------------------------------------------------------
select t_as(:cust2);
select t_denied('insufficient balance rolls everything back (cust2 has 0)',
  $$select public.place_order_with_wallet('bbbbbbbb-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',30,31,'x',null)$$);
reset role;
select t_eq('no orphan order for cust2', (select count(*)::text from public.orders where customer_id = :cust2), '0');

select t_as(:cust);
set role authenticated;
select (public.place_order_with_wallet('bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001', 30, 31, 'addr', null)).id as order1 \gset
select t_eq('wallet debited by server price', (select balance_piastres::text from public.wallets where user_id = auth.uid()), '5000');
select t_eq('order price is catalog price', (select price_egp::text from public.orders where id = :'order1'), '150');

select t_denied('unknown wash type rejected',
  $$select public.place_order_with_wallet('bbbbbbbb-0000-0000-0000-000000000001','exterior',30,31,'x',null)$$);
select t_denied('inactive/foreign tenant rejected',
  $$select public.place_order_with_wallet('bbbbbbbb-0000-0000-0000-0000000000ff','cccccccc-0000-0000-0000-000000000001',30,31,'x',null)$$);

-- direct insert with tampered fields: trigger overwrites them
insert into public.orders (customer_id, tenant_id, wash_type_id, wash_type_name, price_egp, status, worker_user_id)
values (auth.uid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Hacked', 1, 'completed', :worker)
returning id as order2 \gset
select t_eq('tampered insert: price forced', (select price_egp::text from public.orders where id = :'order2'), '150');
select t_eq('tampered insert: status forced', (select status from public.orders where id = :'order2'), 'pending');
select t_eq('tampered insert: worker cleared', (select coalesce(worker_user_id::text,'null') from public.orders where id = :'order2'), 'null');
select t_eq('tampered insert: name forced', (select wash_type_name from public.orders where id = :'order2'), 'Full');
select t_denied('insert with unknown wash type',
  $$insert into public.orders (customer_id, tenant_id, wash_type_id, wash_type_name, price_egp) values (auth.uid(),'bbbbbbbb-0000-0000-0000-000000000001','nope','x',1)$$);

select t_denied('customer cannot change price', format($$update public.orders set price_egp = 1 where id = %L$$, :'order2'));
select t_denied('customer cannot mark own order completed', format($$update public.orders set status = 'completed' where id = %L$$, :'order2'));
select t_denied('customer cannot assign a worker', format($$update public.orders set worker_user_id = %L where id = %L$$, :worker, :'order2'));
select t_ok('customer can cancel a pending order', format($$update public.orders set status = 'cancelled' where id = %L$$, :'order2'));

-- ---------------------------------------------------------------------
-- 3. Order lifecycle by workers
-- ---------------------------------------------------------------------
select t_as(:evil);
select t_rows('stranger cannot see/update an order', format($$update public.orders set status = 'accepted' where id = %L$$, :'order1'), 0);

select t_as(:worker2);
select t_rows('worker of ANOTHER tenant cannot claim', format($$update public.orders set status = 'accepted', worker_user_id = auth.uid() where id = %L$$, :'order1'), 0);

select t_as(:worker);
select t_denied('worker cannot claim for someone else', format($$update public.orders set status = 'accepted', worker_user_id = %L where id = %L$$, :cust, :'order1'));
select t_denied('worker cannot skip claim (pending -> washing)', format($$update public.orders set status = 'washing', worker_user_id = auth.uid() where id = %L$$, :'order1'));
select t_ok('worker claims open order', format($$update public.orders set status = 'accepted', worker_user_id = auth.uid() where id = %L$$, :'order1'));
select t_denied('worker cannot change price', format($$update public.orders set price_egp = 9999 where id = %L$$, :'order1'));
select t_ok('worker advances accepted -> on_the_way', format($$update public.orders set status = 'on_the_way' where id = %L$$, :'order1'));
select t_denied('worker cannot go backwards', format($$update public.orders set status = 'accepted' where id = %L$$, :'order1'));
select t_denied('worker cannot cancel', format($$update public.orders set status = 'cancelled' where id = %L$$, :'order1'));
select t_denied('worker cannot hand the order to another worker', format($$update public.orders set worker_user_id = %L where id = %L$$, :worker2, :'order1'));

select t_as(:cust);
select t_denied('customer cannot cancel once accepted', format($$update public.orders set status = 'cancelled' where id = %L$$, :'order1'));

-- ---------------------------------------------------------------------
-- 4. worker_locations
-- ---------------------------------------------------------------------
select t_as(:evil);
select t_denied('stranger cannot squat a location row',
  format($$insert into public.worker_locations (order_id, tenant_id, worker_user_id, lat, lng) values (%L,'bbbbbbbb-0000-0000-0000-000000000001',auth.uid(),1,1)$$, :'order1'));
select t_as(:worker2);
select t_denied('other tenant worker cannot write location',
  format($$insert into public.worker_locations (order_id, tenant_id, worker_user_id, lat, lng) values (%L,'bbbbbbbb-0000-0000-0000-000000000001',auth.uid(),1,1)$$, :'order1'));
select t_as(:worker);
select t_ok('assigned worker writes location',
  format($$insert into public.worker_locations (order_id, tenant_id, worker_user_id, lat, lng) values (%L,'bbbbbbbb-0000-0000-0000-000000000001',auth.uid(),1,1)$$, :'order1'));
select t_ok('assigned worker updates location',
  format($$update public.worker_locations set lat = 2 where order_id = %L$$, :'order1'));

-- ---------------------------------------------------------------------
-- 5. tenant_members / tenants
-- ---------------------------------------------------------------------
select t_as(:evil);
select t_denied('stranger cannot self-insert as owner of any tenant',
  $$insert into public.tenant_members (tenant_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-000000000001', auth.uid(), 'owner')$$);
select t_denied('stranger cannot self-insert as worker',
  $$insert into public.tenant_members (tenant_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-000000000001', auth.uid(), 'worker')$$);
select t_denied('stranger cannot self-insert as admin',
  $$insert into public.tenant_members (tenant_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-000000000001', auth.uid(), 'admin')$$);

select t_as(:worker);
select t_denied('worker cannot promote self to owner', $$update public.tenant_members set role = 'owner' where user_id = auth.uid()$$);
select t_denied('worker cannot promote self to admin', $$update public.tenant_members set role = 'admin' where user_id = auth.uid()$$);
select t_denied('worker cannot edit own rating', $$update public.tenant_members set rating = 1 where user_id = auth.uid()$$);
select t_denied('worker cannot re-activate/deactivate self', $$update public.tenant_members set is_active = false where user_id = auth.uid()$$);
select t_denied('worker cannot move to another tenant', $$update public.tenant_members set tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002' where user_id = auth.uid()$$);
select t_ok('worker can go online', $$update public.tenant_members set is_online = true where user_id = auth.uid()$$);
select t_ok('worker can set vehicle', $$update public.tenant_members set vehicle = 'Van' where user_id = auth.uid()$$);

select t_as(:owner);
select t_ok('owner adds a worker',
  format($$insert into public.tenant_members (tenant_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-000000000001', %L, 'worker')$$, :cust2));
select t_ok('owner promotes worker to admin',
  format($$update public.tenant_members set role = 'admin' where user_id = %L and tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$, :cust2));
select t_denied('owner cannot demote/reassign the owner row via role',
  $$update public.tenant_members set role = 'worker' where user_id = auth.uid()$$);
select t_rows('owner row cannot be deleted',
  $$delete from public.tenant_members where user_id = auth.uid()$$, 0);
select t_denied('owner cannot hand ownership by promoting a worker to owner',
  format($$update public.tenant_members set role = 'owner' where user_id = %L$$, :worker));
select t_denied('owner cannot reassign tenants.owner_id',
  format($$update public.tenants set owner_id = %L where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$, :worker));
select t_ok('owner can rename tenant', $$update public.tenants set name = 'Renamed' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$);
select t_rows('owner cannot touch another tenant', $$update public.tenants set name = 'Pwned' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$, 0);

select t_as(:cust2); -- now an admin of tenant one
select t_denied('admin cannot add another admin',
  format($$insert into public.tenant_members (tenant_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-000000000001', %L, 'admin')$$, :evil));
select t_ok('admin can add a worker',
  format($$insert into public.tenant_members (tenant_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-000000000001', %L, 'worker')$$, :evil));
select t_denied('admin cannot change roles',
  format($$update public.tenant_members set role = 'admin' where user_id = %L$$, :evil));
select t_denied('admin cannot edit the owner membership',
  format($$update public.tenant_members set is_active = false where user_id = %L$$, :owner));
select t_ok('admin can deactivate a worker',
  format($$update public.tenant_members set is_active = false where user_id = %L and role = 'worker'$$, :evil));

-- ---------------------------------------------------------------------
-- 6. wash_types
-- ---------------------------------------------------------------------
select t_as(:evil);
select t_denied('stranger cannot add to the shared catalog',
  $$insert into public.wash_types (name, price_egp, tenant_id) values ('Free wash', 1, null)$$);
select t_rows('stranger cannot edit the shared catalog',
  $$update public.wash_types set price_egp = 1 where tenant_id is null$$, 0);
select t_rows('stranger cannot delete the shared catalog',
  $$delete from public.wash_types where tenant_id is null$$, 0);
select t_denied('stranger cannot add to a tenant catalog',
  $$insert into public.wash_types (name, price_egp, tenant_id) values ('x', 1, 'bbbbbbbb-0000-0000-0000-000000000001')$$);
select t_as(:owner);
select t_ok('owner adds a service to own tenant',
  $$insert into public.wash_types (name, price_egp, tenant_id) values ('Wax', 90, 'bbbbbbbb-0000-0000-0000-000000000001')$$);
select t_denied('owner cannot add to another tenant',
  $$insert into public.wash_types (name, price_egp, tenant_id) values ('x', 1, 'bbbbbbbb-0000-0000-0000-000000000002')$$);

-- ---------------------------------------------------------------------
-- 7. Service role still works (webhooks / edge functions)
-- ---------------------------------------------------------------------
reset role;
select t_as(:cust);
set role service_role;
select t_ok('service role can credit a topup',
  format($$insert into public.wallet_transactions (user_id, type, amount_piastres, note) values (%L, 'topup', 12345, 'webhook')$$, :cust));
reset role;
select t_eq('ledger trigger updated balance', (select balance_piastres::text from public.wallets where user_id = :cust), '17345');

\echo ALL SECURITY CHECKS PASSED
