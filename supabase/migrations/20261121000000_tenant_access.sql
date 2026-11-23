create schema sponsor_guard_private;
revoke all on schema sponsor_guard_private from public, anon, authenticated, service_role;
grant usage on schema sponsor_guard_private to authenticated;

create type public.membership_role as enum ('owner', 'admin', 'hr_user', 'viewer');
create type public.audit_event as enum (
  'organisation_created', 'organisation_updated', 'membership_changed'
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0)
);

create table public.memberships (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null,
  primary key (organisation_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  event public.audit_event not null,
  created_at timestamptz not null default now()
);
create index audit_log_organisation_created_idx on public.audit_log (organisation_id, created_at);

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.organisations, public.profiles, public.memberships, public.audit_log
  from public, anon, authenticated, service_role;
grant select on public.organisations, public.profiles, public.memberships, public.audit_log to authenticated;
grant update (name) on public.organisations to authenticated;
grant insert, update (display_name) on public.profiles to authenticated;
grant insert, update (role), delete on public.memberships to authenticated;

-- Trusted provisioning can create organisations and assign owners.
grant select, insert, update, delete on public.organisations, public.profiles, public.memberships to service_role;
grant select, insert on public.audit_log to service_role;

-- These helpers are owned by the migration role so that their membership
-- lookups do not recurse through the membership policy.
create function sponsor_guard_private.is_member(target_organisation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organisation_id = target_organisation and user_id = (select auth.uid())
  );
$$;

create function sponsor_guard_private.has_role(
  target_organisation uuid, variadic allowed_roles public.membership_role[]
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organisation_id = target_organisation
      and user_id = (select auth.uid())
      and role = any (allowed_roles)
  );
$$;

create function sponsor_guard_private.can_manage_membership(
  target_organisation uuid, target_role public.membership_role
)
returns boolean language sql stable set search_path = ''
as $$
  select case target_role
    when 'owner' then false
    when 'admin' then sponsor_guard_private.has_role(target_organisation, 'owner')
    else sponsor_guard_private.has_role(target_organisation, 'owner', 'admin')
  end;
$$;

revoke all on all functions in schema sponsor_guard_private from public, anon, authenticated, service_role;
grant execute on all functions in schema sponsor_guard_private to authenticated;

create policy organisations_select on public.organisations for select to authenticated
  using (sponsor_guard_private.is_member(id));
create policy organisations_update on public.organisations for update to authenticated
  using (sponsor_guard_private.has_role(id, 'owner', 'admin'))
  with check (sponsor_guard_private.has_role(id, 'owner', 'admin'));

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy memberships_select on public.memberships for select to authenticated
  using (sponsor_guard_private.is_member(organisation_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (sponsor_guard_private.can_manage_membership(organisation_id, role));
create policy memberships_update on public.memberships for update to authenticated
  using (sponsor_guard_private.can_manage_membership(organisation_id, role))
  with check (sponsor_guard_private.can_manage_membership(organisation_id, role));
create policy memberships_delete on public.memberships for delete to authenticated
  using (sponsor_guard_private.can_manage_membership(organisation_id, role));

create policy audit_log_select on public.audit_log for select to authenticated
  using (sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'));
