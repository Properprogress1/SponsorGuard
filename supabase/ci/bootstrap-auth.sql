-- Minimal Supabase Auth contract for the standalone PostgreSQL service.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
alter table auth.users enable row level security;

create function auth.uid() returns uuid language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;

create function auth.jwt() returns jsonb language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;
