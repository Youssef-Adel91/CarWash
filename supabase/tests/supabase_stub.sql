-- Minimal stand-in for the Supabase pieces the migrations rely on, so
-- supabase/migrations/*.sql can be applied to a plain local Postgres and
-- exercised with supabase/tests/*.sql. Not for real Supabase projects.
--
-- auth.uid() reads the same GUC PostgREST sets, so tests impersonate a user with:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);
--   set role authenticated;

-- roles are cluster-wide, so tolerate re-runs against the same server
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists extensions;

create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create publication supabase_realtime;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
