-- =====================================================================
-- Fix: customers/admins couldn't actually read the assigned worker's
-- name/phone. user_profiles RLS only allowed `id = auth.uid()`, so
-- workerService.getWorkerDisplayInfo() was silently returning nothing
-- for anyone but the worker themselves. This adds two narrow read paths:
--  - a customer can read the profile of the worker on THEIR OWN order
--  - a tenant owner/admin can read profiles of their own tenant_members
-- Run this after 0000 + 0001.
-- =====================================================================

drop policy if exists user_profiles_select_assigned_worker on public.user_profiles;
create policy user_profiles_select_assigned_worker on public.user_profiles for select
  using (
    exists (
      select 1 from public.orders o
      where o.worker_user_id = user_profiles.id
        and o.customer_id = auth.uid()
    )
  );

drop policy if exists user_profiles_select_tenant_worker on public.user_profiles;
create policy user_profiles_select_tenant_worker on public.user_profiles for select
  using (
    exists (
      select 1 from public.tenant_members m
      where m.user_id = user_profiles.id
        and public.is_tenant_member(m.tenant_id, array['owner','admin'])
    )
  );
