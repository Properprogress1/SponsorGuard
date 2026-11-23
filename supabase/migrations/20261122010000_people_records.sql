create table public.sponsored_workers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  reference text not null check (length(trim(reference)) between 1 and 80),
  status text not null check (status in ('active', 'inactive')),
  unique (organisation_id, id),
  unique (organisation_id, reference)
);

create table public.engaged_individuals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  reference text not null check (length(trim(reference)) between 1 and 80),
  engagement_type text not null check (engagement_type in ('employee', 'contractor', 'subcontractor', 'agency', 'platform')),
  unique (organisation_id, id),
  unique (organisation_id, reference)
);

create table public.cos_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  sponsored_worker_id uuid not null,
  reference text not null check (length(trim(reference)) between 1 and 80),
  assigned_on date not null check (assigned_on between date '0001-01-01' and date '9999-12-31'),
  status text not null check (status in ('assigned', 'used', 'withdrawn')),
  unique (organisation_id, reference),
  foreign key (organisation_id, sponsored_worker_id)
    references public.sponsored_workers (organisation_id, id) on delete cascade
);

create table public.rtw_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  sponsored_worker_id uuid,
  engaged_individual_id uuid,
  checked_on date not null check (checked_on between date '0001-01-01' and date '9999-12-31'),
  method text not null check (method in ('online', 'manual', 'other')),
  follow_up_on date check (follow_up_on >= checked_on and follow_up_on <= date '9999-12-31'),
  check (num_nonnulls(sponsored_worker_id, engaged_individual_id) = 1),
  foreign key (organisation_id, sponsored_worker_id)
    references public.sponsored_workers (organisation_id, id) on delete cascade,
  foreign key (organisation_id, engaged_individual_id)
    references public.engaged_individuals (organisation_id, id) on delete cascade
);

create index cos_records_worker_idx on public.cos_records (organisation_id, sponsored_worker_id);
create index rtw_checks_worker_idx on public.rtw_checks (organisation_id, sponsored_worker_id);
create index rtw_checks_individual_idx on public.rtw_checks (organisation_id, engaged_individual_id);

do $$
declare
  relation text;
begin
  foreach relation in array array['sponsored_workers', 'engaged_individuals', 'cos_records', 'rtw_checks']
  loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', relation);
    execute format('grant select on public.%I to authenticated', relation);
    execute format('grant select, insert, update, delete on public.%I to service_role', relation);
    execute format(
      'create policy require_mfa on public.%I as restrictive to authenticated
        using ((select auth.jwt() ->> ''aal'') = ''aal2'')', relation);
    execute format(
      'create policy members_read on public.%I for select to authenticated
        using (sponsor_guard_private.is_member(organisation_id))', relation);
    execute format(
      'create policy editors_insert on public.%I for insert to authenticated
        with check (sponsor_guard_private.has_role(organisation_id, ''owner'', ''admin'', ''hr_user''))', relation);
    execute format(
      'create policy editors_update on public.%I for update to authenticated
        using (sponsor_guard_private.has_role(organisation_id, ''owner'', ''admin'', ''hr_user''))
        with check (sponsor_guard_private.has_role(organisation_id, ''owner'', ''admin'', ''hr_user''))', relation);
  end loop;
end;
$$;

grant insert (organisation_id, full_name, reference, status) on public.sponsored_workers to authenticated;
grant insert (organisation_id, full_name, reference, engagement_type) on public.engaged_individuals to authenticated;
grant insert (organisation_id, sponsored_worker_id, reference, assigned_on, status)
  on public.cos_records to authenticated;
grant insert (organisation_id, sponsored_worker_id, engaged_individual_id, checked_on, method, follow_up_on)
  on public.rtw_checks to authenticated;

grant update (full_name, reference, status) on public.sponsored_workers to authenticated;
grant update (full_name, reference, engagement_type) on public.engaged_individuals to authenticated;
grant update (sponsored_worker_id, reference, assigned_on, status) on public.cos_records to authenticated;
grant update (sponsored_worker_id, engaged_individual_id, checked_on, method, follow_up_on)
  on public.rtw_checks to authenticated;
