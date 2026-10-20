-- =====================================================================
-- Lightweight anti-abuse safeguards for signup / fake accounts.
-- Run after 0001-0003. Safe to re-run.
--
-- This does NOT try to reimplement IP-based rate limiting in SQL —
-- Supabase Auth already rate-limits its own signup/OTP endpoints by
-- default (Dashboard → Authentication → Rate Limits lets you tighten
-- those further, e.g. lower "sign ups per hour" per IP). Combined with
-- the mandatory 10 EGP registration fee already required before an
-- account becomes usable, that covers the realistic abuse case without
-- extra moving parts. What THIS file adds is a real data-integrity
-- guard: one phone number can no longer back multiple accounts.
-- =====================================================================

-- Normalize + de-duplicate any existing accidental duplicates BEFORE
-- adding the unique index, otherwise the index creation itself would
-- fail. This keeps the oldest row's phone and blanks it on any newer
-- duplicates (their account still works, they'd just need to re-enter
-- a phone number if they ever edit their profile).
with dupes as (
  select id,
         row_number() over (
           partition by lower(trim(phone))
           order by created_at asc
         ) as rn
  from public.user_profiles
  where phone is not null and trim(phone) <> ''
)
update public.user_profiles up
set phone = null
from dupes
where up.id = dupes.id and dupes.rn > 1;

create unique index if not exists user_profiles_phone_unique
  on public.user_profiles (lower(trim(phone)))
  where phone is not null and trim(phone) <> '';

-- =====================================================================
-- Done. Recommended manual step (not doable from SQL): in Supabase
-- Dashboard → Authentication → Rate Limits, consider lowering "Sign ups
-- and sign ins" per-IP-per-hour if you start seeing abuse.
-- =====================================================================
