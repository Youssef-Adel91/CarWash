-- =====================================================================
-- 0005_wallet.sql
-- In-app wallet, saved payment method tokens, and saved addresses.
-- Run after 0001-0004. Safe to re-run (uses IF NOT EXISTS).
--
-- Design decisions documented here:
--
-- 1. PIASTRES NOT FLOATS — balance_piastres is a bigint (1 EGP = 100
--    piastres). This avoids floating-point rounding errors on financial
--    data. The service layer divides by 100 before showing the UI.
--
-- 2. IMMUTABLE LEDGER — wallet_transactions has no UPDATE/DELETE RLS
--    for regular users. Every transaction is permanent. Corrections are
--    made by inserting a new offsetting row (e.g. a refund).
--
-- 3. ATOMIC BALANCE — a AFTER INSERT trigger on wallet_transactions
--    updates wallets.balance_piastres in the same transaction, so the
--    balance is always consistent with the ledger even if two requests
--    land simultaneously.
--
-- 4. TOP-UP ONLY — there is intentionally no 'withdrawal' transaction
--    type. Wallet funds can only be spent within the app or refunded
--    back to the wallet. This avoids money-transfer regulations.
--    DO NOT add a withdrawal type without owner approval.
--
-- 5. NO RAW CARD DATA — payment_methods stores only the gateway token
--    + last 4 digits + brand. Full card numbers and CVCs are never
--    written to this database.
-- =====================================================================

-- -----------------------------------------------------------
-- payment_methods: tokenized saved cards (Paymob token only)
-- -----------------------------------------------------------
create table if not exists public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null,
  last4        char(4) not null,
  brand        text not null default 'card',
  expires_at   text,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.payment_methods enable row level security;

create policy "pm_owner_select" on public.payment_methods
  for select using (auth.uid() = user_id);
create policy "pm_owner_insert" on public.payment_methods
  for insert with check (auth.uid() = user_id);
create policy "pm_owner_update" on public.payment_methods
  for update using (auth.uid() = user_id);
create policy "pm_owner_delete" on public.payment_methods
  for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------
-- wallets: one row per user, balance kept in piastres (bigint)
-- -----------------------------------------------------------
create table if not exists public.wallets (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  balance_piastres   bigint not null default 0 check (balance_piastres >= 0),
  updated_at         timestamptz not null default now()
);

alter table public.wallets enable row level security;

create policy "wallet_owner_select" on public.wallets
  for select using (auth.uid() = user_id);
create policy "wallet_owner_update" on public.wallets
  for update using (auth.uid() = user_id);

-- Auto-create a wallet row whenever a new user_profiles row is inserted.
create or replace function public.handle_new_wallet()
returns trigger language plpgsql security definer as $$
begin
  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created_create_wallet on public.user_profiles;
create trigger on_profile_created_create_wallet
  after insert on public.user_profiles
  for each row execute procedure public.handle_new_wallet();

-- -----------------------------------------------------------
-- wallet_transactions: immutable ledger
-- -----------------------------------------------------------
create table if not exists public.wallet_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  type             text not null check (type in (
                     'topup',
                     'order_debit',
                     'refund',
                     'commission_debit'
                   )),
  amount_piastres  bigint not null check (amount_piastres > 0),
  order_id         uuid references public.orders(id) on delete set null,
  payment_id       uuid,
  note             text,
  created_at       timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

create policy "wt_owner_select" on public.wallet_transactions
  for select using (auth.uid() = user_id);
create policy "wt_owner_insert" on public.wallet_transactions
  for insert with check (auth.uid() = user_id);

-- Atomic balance update trigger.
--
-- IMPORTANT FIX (Claude, reviewing before this migration was ever run):
-- the original version of this function used
--   insert ... on conflict (user_id) do update
--     set balance_piastres = greatest(0, wallets.balance_piastres + delta)
-- which SILENTLY CLAMPS an over-large debit to a balance of 0 instead of
-- rejecting it — the wallet_transactions row still gets committed as if
-- the debit succeeded. That means the client-side balance check in
-- services/walletService.ts (payWithWallet) was the ONLY thing standing
-- between a customer and getting a wash "paid for" out of a wallet that
-- didn't have the funds — a direct table insert (or a future bug/race
-- condition between two concurrent debits) could bypass it entirely and
-- there would be no database-level guarantee at all.
--
-- Fixed to: lock the wallet row for the duration of the transaction,
-- compute the resulting balance, and RAISE EXCEPTION (which rolls back
-- the whole insert, so no orphaned ledger row is left behind) if a debit
-- would take the balance below zero. Top-ups and refunds are unaffected.
create or replace function public.apply_wallet_transaction()
returns trigger language plpgsql security definer as $$
declare
  delta bigint;
  current_balance bigint;
begin
  if new.type in ('topup', 'refund') then
    delta := new.amount_piastres;
  else
    delta := -new.amount_piastres;
  end if;

  -- Make sure a wallet row exists, then lock it so two concurrent debits
  -- for the same user can't both read a balance that only one of them
  -- can actually afford.
  insert into public.wallets (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;

  select balance_piastres into current_balance
  from public.wallets
  where user_id = new.user_id
  for update;

  if current_balance + delta < 0 then
    raise exception 'Insufficient wallet balance for user %', new.user_id
      using errcode = 'P0001';
  end if;

  update public.wallets
    set balance_piastres = current_balance + delta,
        updated_at = now()
    where user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists on_wallet_tx_update_balance on public.wallet_transactions;
create trigger on_wallet_tx_update_balance
  after insert on public.wallet_transactions
  for each row execute procedure public.apply_wallet_transaction();

-- -----------------------------------------------------------
-- saved_addresses
-- -----------------------------------------------------------
create table if not exists public.saved_addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,
  lat         numeric(10,7) not null,
  lng         numeric(10,7) not null,
  address     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.saved_addresses enable row level security;

create policy "sa_owner_select" on public.saved_addresses
  for select using (auth.uid() = user_id);
create policy "sa_owner_insert" on public.saved_addresses
  for insert with check (auth.uid() = user_id);
create policy "sa_owner_update" on public.saved_addresses
  for update using (auth.uid() = user_id);
create policy "sa_owner_delete" on public.saved_addresses
  for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------
-- account_deletion_requests
-- -----------------------------------------------------------
create table if not exists public.account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  processed    boolean not null default false
);

alter table public.account_deletion_requests enable row level security;

create policy "adr_owner_insert" on public.account_deletion_requests
  for insert with check (auth.uid() = user_id);
create policy "adr_owner_select" on public.account_deletion_requests
  for select using (auth.uid() = user_id);

-- -----------------------------------------------------------
-- Back-fill wallets for existing users (safe — ON CONFLICT DO NOTHING)
-- -----------------------------------------------------------
insert into public.wallets (user_id)
select id from public.user_profiles
on conflict do nothing;
