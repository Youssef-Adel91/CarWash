-- =====================================================================
-- Push notifications (Expo push tokens + order-event triggers)
-- Run this once in the Supabase / OnSpace SQL editor for your project,
-- after 0001_saas_multitenant.sql and 0002_worker_visibility_fix.sql.
-- Safe to re-run: every object below is created with IF NOT EXISTS /
-- OR REPLACE / DROP ... IF EXISTS first, matching the idempotent style
-- of the earlier migrations in this folder.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. pg_net extension — needed for the http_post call in notify_push().
-- This usually requires elevated privileges. If the DO block below fails
-- silently (it swallows the error so the rest of this migration still
-- runs), enable it manually from the Supabase Dashboard:
--   Database → Extensions → search "pg_net" → Enable.
-- Until pg_net is enabled, notify_push() will raise at call time (each
-- call is already wrapped in its own exception guard below, so it will
-- not block order inserts/updates — pushes just silently won't send).
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  null; -- needs manual enable from Dashboard → Database → Extensions
end $$;

-- ---------------------------------------------------------------------
-- 1. PUSH TOKENS  (one row per device per user)
-- ---------------------------------------------------------------------
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens for select
  using (user_id = auth.uid());

drop policy if exists push_tokens_insert on public.push_tokens;
create policy push_tokens_insert on public.push_tokens for insert
  with check (user_id = auth.uid());

drop policy if exists push_tokens_update on public.push_tokens;
create policy push_tokens_update on public.push_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_tokens_delete on public.push_tokens;
create policy push_tokens_delete on public.push_tokens for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. notify_push() — fans a message out to every device token of the
-- given users via the Expo push HTTP API. Per-token errors (expired /
-- invalid tokens, pg_net unavailable, network hiccups) are swallowed so
-- one bad token never blocks the others or the calling trigger.
-- ---------------------------------------------------------------------
create or replace function public.notify_push(
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select distinct token
    from public.push_tokens
    where user_id = any(p_user_ids)
  loop
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Accept', 'application/json'
        ),
        body := jsonb_build_object(
          'to', r.token,
          'title', p_title,
          'body', p_body,
          'data', p_data
        )
      );
    exception when others then
      null; -- bad/expired token or pg_net unavailable — skip, keep going
    end;
  end loop;
end;
$$;

alter function public.notify_push(uuid[], text, text, jsonb) owner to postgres;

-- ---------------------------------------------------------------------
-- 3. New pending order → notify online workers of that tenant.
-- Note: the title/body below are plain English, sent as-is to the OS
-- notification tray via Expo's push API (title/body are not i18n-able
-- server-side without duplicating the whole client dictionary in SQL).
-- Per-user-language push copy is a future improvement — it would need
-- each push_tokens row to also store the user's preferred language.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_pending_order()
returns trigger
language plpgsql
security definer
as $$
declare
  v_worker_ids uuid[];
begin
  select array_agg(tm.user_id)
  into v_worker_ids
  from public.tenant_members tm
  where tm.tenant_id = new.tenant_id
    and tm.role = 'worker'
    and tm.is_active = true
    and tm.is_online = true;

  if v_worker_ids is not null and array_length(v_worker_ids, 1) > 0 then
    perform public.notify_push(
      v_worker_ids,
      'New wash request',
      'A customer near you needs a wash — tap to view.',
      jsonb_build_object('type', 'new_order', 'orderId', new.id, 'tenantId', new.tenant_id)
    );
  end if;

  return new;
end;
$$;

alter function public.handle_new_pending_order() owner to postgres;

-- ---------------------------------------------------------------------
-- 4. Order status change → notify the customer.
-- ---------------------------------------------------------------------
create or replace function public.handle_order_status_change()
returns trigger
language plpgsql
security definer
as $$
declare
  v_title text;
  v_body text;
begin
  case new.status
    when 'accepted' then
      v_title := 'Worker on the way';
      v_body := 'A worker accepted your order.';
    when 'on_the_way' then
      v_title := 'Worker is on the way';
      v_body := 'Worker is on the way';
    when 'washing' then
      v_title := 'Your wash has started';
      v_body := 'Your wash has started';
    when 'completed' then
      v_title := 'All done!';
      v_body := 'Your car is sparkling clean.';
    when 'cancelled' then
      v_title := 'Order cancelled';
      v_body := 'Order cancelled';
    else
      -- unknown/other status values: skip sending rather than erroring
      return new;
  end case;

  perform public.notify_push(
    array[new.customer_id],
    v_title,
    v_body,
    jsonb_build_object('type', 'order_status', 'orderId', new.id, 'status', new.status)
  );

  return new;
end;
$$;

alter function public.handle_order_status_change() owner to postgres;

-- ---------------------------------------------------------------------
-- 5. Wire the triggers on public.orders (drop-then-create so this file
-- is safely re-runnable).
-- ---------------------------------------------------------------------
drop trigger if exists trg_new_pending_order on public.orders;
create trigger trg_new_pending_order
  after insert on public.orders
  for each row
  when (new.status = 'pending')
  execute function public.handle_new_pending_order();

drop trigger if exists trg_order_status_change on public.orders;
create trigger trg_order_status_change
  after update of status on public.orders
  for each row
  when (new.status is distinct from old.status)
  execute function public.handle_order_status_change();

-- =====================================================================
-- Done. Next steps for you:
--  1. Run this file in Supabase Studio → SQL editor (or `supabase db push`).
--  2. If step 0 could not enable pg_net automatically, enable it from
--     Dashboard → Database → Extensions, then re-run this file.
--  3. Client side: services/notificationsService.ts registers each
--     device's Expo push token into push_tokens on login.
-- =====================================================================
