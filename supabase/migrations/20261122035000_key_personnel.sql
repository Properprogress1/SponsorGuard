-- The Key Personnel workspace has no pre-existing persistence.
create table public.key_personnel (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  role text not null check (length(trim(role)) between 1 and 120)
);
create index key_personnel_organisation_idx on public.key_personnel (organisation_id);
alter table public.key_personnel enable row level security;
revoke all on public.key_personnel from public, anon, authenticated, service_role;
grant select, delete on public.key_personnel to authenticated;
grant insert (organisation_id, full_name, role), update (full_name, role)
  on public.key_personnel to authenticated;
grant select, insert, update, delete on public.key_personnel to service_role;
create policy key_personnel_managers on public.key_personnel to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2'
    and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'))
  with check ((select auth.jwt() ->> 'aal') = 'aal2'
    and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'));
