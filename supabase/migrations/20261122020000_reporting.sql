create table public.reporting_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  description text not null check (length(trim(description)) > 0),
  working_day_limit integer not null check (working_day_limit > 0),
  source_reference text not null check (length(trim(source_reference)) > 0),
  effective_from date not null check (isfinite(effective_from)),
  effective_to date check (isfinite(effective_to) and effective_to > effective_from),
  version integer not null check (version > 0),
  requires_verification boolean not null default true,
  unique (key, version)
);
create index reporting_rules_lookup_idx on public.reporting_rules (key, effective_from desc, version desc);

create table public.bank_holiday_years (
  year integer primary key check (year between 1 and 9999),
  source_reference text not null check (length(trim(source_reference)) > 0)
);

create table public.bank_holidays (
  holiday_on date primary key check (isfinite(holiday_on)),
  year integer generated always as (extract(year from holiday_on)::integer) stored
    references public.bank_holiday_years (year),
  name text not null check (length(trim(name)) > 0)
);
create index bank_holidays_year_idx on public.bank_holidays (year);

create table public.reporting_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  rule_key text not null,
  event_on date not null check (isfinite(event_on)),
  reporting_rule_id uuid not null references public.reporting_rules (id),
  due_on date not null check (isfinite(due_on) and due_on > event_on),
  created_at timestamptz not null default now(),
  unique (organisation_id, id)
);
create index reporting_events_deadline_idx on public.reporting_events (organisation_id, due_on, id);
create index reporting_events_rule_idx on public.reporting_events (reporting_rule_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  reporting_event_id uuid not null,
  completed boolean not null default false,
  unique (organisation_id, reporting_event_id),
  foreign key (organisation_id, reporting_event_id)
    references public.reporting_events (organisation_id, id) on delete cascade
);

do $$
declare
  relation text;
begin
  foreach relation in array array['reporting_rules', 'bank_holiday_years', 'bank_holidays', 'reporting_events', 'tasks'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', relation);
    execute format('grant select on public.%I to authenticated, service_role', relation);
  end loop;
  foreach relation in array array['reporting_rules', 'bank_holiday_years', 'bank_holidays'] loop
    execute format('create policy verified_read on public.%I for select to authenticated
      using ((select auth.jwt() ->> ''aal'') = ''aal2'')', relation);
  end loop;
  foreach relation in array array['reporting_events', 'tasks'] loop
    execute format('create policy require_mfa on public.%I as restrictive to authenticated
      using ((select auth.jwt() ->> ''aal'') = ''aal2'')', relation);
    execute format('create policy members_read on public.%I for select to authenticated
      using (sponsor_guard_private.is_member(organisation_id))', relation);
  end loop;
end;
$$;

grant insert (organisation_id, rule_key, event_on) on public.reporting_events to authenticated, service_role;
grant update (completed) on public.tasks to authenticated, service_role;

create policy editors_record_event on public.reporting_events for insert to authenticated
  with check (sponsor_guard_private.has_role(organisation_id, 'owner', 'admin', 'hr_user'));
create policy editors_update_completion on public.tasks for update to authenticated
  using (sponsor_guard_private.has_role(organisation_id, 'owner', 'admin', 'hr_user'))
  with check (sponsor_guard_private.has_role(organisation_id, 'owner', 'admin', 'hr_user'));

create function sponsor_guard_private.guard_reporting_rule_history()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'Reporting rules are append-only. Insert a new version.' using errcode = '55000';
end;
$$;
revoke all on function sponsor_guard_private.guard_reporting_rule_history() from public, anon, authenticated, service_role;
create trigger reporting_rules_append_only
  before update or delete or truncate on public.reporting_rules
  for each statement execute function sponsor_guard_private.guard_reporting_rule_history();

-- The latest effective start wins. A later version can close a rule without
-- making an older version active again. Equal starts use the highest version.
create function public.compute_reporting_due_date(rule_key text, event_on date)
returns table (reporting_rule_id uuid, due_on date)
language plpgsql stable set search_path = ''
as $$
declare
  selected public.reporting_rules%rowtype;
  candidate date := event_on;
  checked_year integer;
  candidate_year integer;
  remaining integer;
begin
  if event_on is null or not isfinite(event_on) then
    raise exception 'A valid event date is required.' using errcode = '22023';
  end if;

  select rule.* into selected
  from public.reporting_rules rule
  where rule.key = rule_key and rule.effective_from <= event_on
  order by rule.effective_from desc, rule.version desc
  limit 1;
  if not found or (selected.effective_to is not null and event_on >= selected.effective_to) then
    raise exception 'No reporting rule is effective on the event date.' using errcode = 'P2001';
  end if;

  checked_year := extract(year from event_on)::integer;
  if not exists (select 1 from public.bank_holiday_years year_config where year_config.year = checked_year) then
    raise exception 'The bank holiday calendar does not cover the event year.' using errcode = 'P2002';
  end if;

  remaining := selected.working_day_limit;
  while remaining > 0 loop
    candidate := candidate + 1;
    candidate_year := extract(year from candidate)::integer;
    if candidate_year <> checked_year then
      if not exists (select 1 from public.bank_holiday_years year_config where year_config.year = candidate_year) then
        raise exception 'The bank holiday calendar does not cover the deadline year.' using errcode = 'P2002';
      end if;
      checked_year := candidate_year;
    end if;
    if extract(isodow from candidate) <= 5
      and not exists (select 1 from public.bank_holidays h where h.holiday_on = candidate) then
      remaining := remaining - 1;
    end if;
  end loop;

  return query select selected.id, candidate;
end;
$$;
revoke all on function public.compute_reporting_due_date(text, date) from public, anon, authenticated, service_role;
grant execute on function public.compute_reporting_due_date(text, date) to authenticated, service_role;

create function sponsor_guard_private.set_reporting_deadline()
returns trigger language plpgsql set search_path = ''
as $$
begin
  select result.reporting_rule_id, result.due_on into strict new.reporting_rule_id, new.due_on
    from public.compute_reporting_due_date(new.rule_key, new.event_on) result;
  return new;
end;
$$;
revoke all on function sponsor_guard_private.set_reporting_deadline() from public, anon, authenticated, service_role;
create trigger reporting_event_deadline before insert on public.reporting_events
  for each row execute function sponsor_guard_private.set_reporting_deadline();

create function sponsor_guard_private.create_reporting_task()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.tasks (organisation_id, reporting_event_id) values (new.organisation_id, new.id);
  return new;
end;
$$;
revoke all on function sponsor_guard_private.create_reporting_task() from public, anon, authenticated, service_role;
create trigger reporting_event_task after insert on public.reporting_events
  for each row execute function sponsor_guard_private.create_reporting_task();

-- England and Wales snapshot from https://www.gov.uk/bank-holidays.json.
insert into public.bank_holiday_years (year, source_reference)
select year, 'https://www.gov.uk/bank-holidays.json' from generate_series(2025, 2028) as years(year);

insert into public.bank_holidays (holiday_on, name) values
  ('2025-01-01', 'New Year’s Day'), ('2025-04-18', 'Good Friday'), ('2025-04-21', 'Easter Monday'),
  ('2025-05-05', 'Early May bank holiday'), ('2025-05-26', 'Spring bank holiday'),
  ('2025-08-25', 'Summer bank holiday'), ('2025-12-25', 'Christmas Day'), ('2025-12-26', 'Boxing Day'),
  ('2026-01-01', 'New Year’s Day'), ('2026-04-03', 'Good Friday'), ('2026-04-06', 'Easter Monday'),
  ('2026-05-04', 'Early May bank holiday'), ('2026-05-25', 'Spring bank holiday'),
  ('2026-08-31', 'Summer bank holiday'), ('2026-12-25', 'Christmas Day'),
  ('2026-12-28', 'Boxing Day (substitute day)'),
  ('2027-01-01', 'New Year’s Day'), ('2027-03-26', 'Good Friday'), ('2027-03-29', 'Easter Monday'),
  ('2027-05-03', 'Early May bank holiday'), ('2027-05-31', 'Spring bank holiday'),
  ('2027-08-30', 'Summer bank holiday'), ('2027-12-27', 'Christmas Day (substitute day)'),
  ('2027-12-28', 'Boxing Day (substitute day)'),
  ('2028-01-03', 'New Year’s Day (substitute day)'), ('2028-04-14', 'Good Friday'),
  ('2028-04-17', 'Easter Monday'), ('2028-05-01', 'Early May bank holiday'),
  ('2028-05-29', 'Spring bank holiday'), ('2028-08-28', 'Summer bank holiday'),
  ('2028-12-25', 'Christmas Day'), ('2028-12-26', 'Boxing Day');

-- VERIFY against current Home Office guidance. Effective starts are illustrative
-- configuration values. Review exceptions before relying on the sample clocks.
insert into public.reporting_rules
  (key, description, working_day_limit, source_reference, effective_from, version, requires_verification)
values
  ('worker_circumstances', 'Change in a sponsored worker’s circumstances', 10,
    'https://www.gov.uk/government/publications/workers-and-temporary-workers-guidance-for-sponsors-part-3-sponsor-duties-and-compliance/workers-and-temporary-workers-guidance-for-sponsors-part-3-sponsor-duties-and-compliance-accessible#reporting-duties',
    '2026-01-01', 1, true),
  ('organisation_change', 'Change in organisation circumstances', 20,
    'https://www.gov.uk/government/publications/workers-and-temporary-workers-guidance-for-sponsors-part-3-sponsor-duties-and-compliance/workers-and-temporary-workers-guidance-for-sponsors-part-3-sponsor-duties-and-compliance-accessible#reporting-duties',
    '2026-01-01', 1, true);
