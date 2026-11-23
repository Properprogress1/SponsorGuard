create table public.ledger_entry_people (
  organisation_id uuid not null,
  sequence bigint not null,
  person_kind text not null check (person_kind in ('worker', 'individual')),
  person_id uuid not null,
  primary key (organisation_id, sequence),
  foreign key (organisation_id, sequence) references public.ledger_entries (organisation_id, sequence)
);
alter table public.ledger_entry_people enable row level security;
revoke all on public.ledger_entry_people from public, anon, authenticated, service_role;
create trigger ledger_people_append_only before update or delete or truncate on public.ledger_entry_people
  for each statement execute function sponsor_guard_private.block_ledger_mutation();

-- Capture the link at the time of the event, after the ledger trigger has appended.
create function sponsor_guard_private.capture_ledger_person()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  tenant uuid;
  worker uuid;
  individual uuid;
  source_id uuid;
begin
  if tg_op = 'UPDATE' and old is not distinct from new then return null; end if;
  if tg_table_name = 'documents' then
    if tg_op <> 'DELETE' and new.state <> 'ready' then return null; end if;
    if tg_op = 'DELETE' and old.state <> 'ready' then return null; end if;
  end if;
  if tg_op = 'DELETE' then
    tenant := old.organisation_id;
    source_id := old.id;
    worker := old.sponsored_worker_id;
    individual := old.engaged_individual_id;
  else
    tenant := new.organisation_id;
    source_id := new.id;
    worker := new.sponsored_worker_id;
    individual := new.engaged_individual_id;
  end if;
  insert into public.ledger_entry_people (organisation_id, sequence, person_kind, person_id)
    select tenant, e.sequence, case when worker is not null then 'worker' else 'individual' end,
      coalesce(worker, individual)
    from (
      select sequence, record_id, record_type
      from public.ledger_entries where organisation_id = tenant
      order by sequence desc limit 1
    ) e where e.record_id = source_id and e.record_type::text = tg_table_name;
  return null;
end;
$$;
revoke all on function sponsor_guard_private.capture_ledger_person() from public, anon, authenticated, service_role;
create trigger zz_rtw_share_scope after insert or update or delete on public.rtw_checks
  for each row execute function sponsor_guard_private.capture_ledger_person();
create trigger zz_document_share_scope after insert or update or delete on public.documents
  for each row execute function sponsor_guard_private.capture_ledger_person();

create table public.passport_shares (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  passcode_hash bytea check (octet_length(passcode_hash) = 32),
  scope text not null check (scope in ('all', 'people', 'dates')),
  worker_ids uuid[] not null default '{}',
  individual_ids uuid[] not null default '{}',
  from_day date,
  through_day date,
  expires_at timestamptz not null check (isfinite(expires_at)),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  last_failed_at timestamptz,
  unique (organisation_id, id),
  check (
    (scope = 'people' and cardinality(worker_ids) + cardinality(individual_ids) > 0
      and from_day is null and through_day is null)
    or (scope = 'dates' and from_day is not null and through_day is not null
      and isfinite(from_day) and isfinite(through_day) and through_day >= from_day
      and cardinality(worker_ids) + cardinality(individual_ids) = 0)
    or (scope = 'all' and from_day is null and through_day is null
      and cardinality(worker_ids) + cardinality(individual_ids) = 0)
  )
);
create index passport_shares_organisation_idx on public.passport_shares (organisation_id, created_at desc);
create table public.passport_share_access (
  id bigint generated always as identity primary key,
  organisation_id uuid not null,
  share_id uuid not null,
  accessed_at timestamptz not null default clock_timestamp(),
  outcome text not null check (outcome in ('opened', 'incorrect_passcode', 'rate_limited')),
  foreign key (organisation_id, share_id) references public.passport_shares (organisation_id, id) on delete cascade
);
create index passport_access_organisation_idx on public.passport_share_access (organisation_id, accessed_at desc);
create index passport_access_share_idx on public.passport_share_access (organisation_id, share_id);

alter table public.passport_shares enable row level security;
alter table public.passport_share_access enable row level security;
revoke all on public.passport_shares, public.passport_share_access from public, anon, authenticated, service_role;
grant select (id, organisation_id, scope, from_day, through_day, expires_at, revoked_at, created_at)
  on public.passport_shares to authenticated;
grant select on public.passport_share_access to authenticated;
create policy passport_shares_managers on public.passport_shares for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'));
create policy passport_access_managers on public.passport_share_access for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'));

create function public.issue_passport_share(
  tenant uuid, actor uuid, token_digest text, passcode_digest text, visibility text,
  expires_on date, workers uuid[], individuals uuid[], start_on date, end_on date
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  result uuid;
  expiry timestamptz;
begin
  if not exists (select 1 from public.memberships m
    where m.organisation_id = tenant and m.user_id = actor and m.role in ('owner', 'admin')) then
    raise exception 'Share access denied.' using errcode = '42501';
  end if;
  if token_digest is null or token_digest !~ '^[0-9a-f]{64}$'
    or (passcode_digest is not null and passcode_digest !~ '^[0-9a-f]{64}$')
    or expires_on is null or not isfinite(expires_on) then
    raise exception 'Invalid share settings.' using errcode = '22023';
  end if;
  expiry := (expires_on + 1)::timestamp at time zone 'Europe/London';
  if expiry <= clock_timestamp() then
    raise exception 'Expiry must be in the future.' using errcode = '22023';
  end if;
  if workers is null or individuals is null
    or cardinality(workers) + cardinality(individuals) > 100
    or exists (select 1 from unnest(workers) selected(id) where not exists
      (select 1 from public.sponsored_workers p where p.organisation_id = tenant and p.id = selected.id))
    or exists (select 1 from unnest(individuals) selected(id) where not exists
      (select 1 from public.engaged_individuals p where p.organisation_id = tenant and p.id = selected.id)) then
    raise exception 'Choose people from the organisation.' using errcode = '22023';
  end if;
  insert into public.passport_shares (organisation_id, token_hash, passcode_hash, scope, expires_at,
    worker_ids, individual_ids, from_day, through_day)
  values (tenant, decode(token_digest, 'hex'), decode(passcode_digest, 'hex'), visibility, expiry,
    workers, individuals, start_on, end_on) returning id into result;
  return result;
end;
$$;

create function public.revoke_passport_share(tenant uuid, share uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if (auth.jwt() ->> 'aal') is distinct from 'aal2'
    or not sponsor_guard_private.has_role(tenant, 'owner', 'admin') then
    raise exception 'Share access denied.' using errcode = '42501';
  end if;
  update public.passport_shares set revoked_at = coalesce(revoked_at, clock_timestamp())
    where organisation_id = tenant and id = share;
  return found;
end;
$$;

create function public.probe_passport_share(token_digest text)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce((select case
    when s.revoked_at is not null or s.expires_at <= now() then 'unavailable'
    when s.failed_attempts >= 5 and s.last_failed_at + interval '15 minutes' > now() then 'locked'
    when s.passcode_hash is not null then 'passcode'
    else 'open' end
  from public.passport_shares s
  where s.token_hash = case when token_digest ~ '^[0-9a-f]{64}$' then decode(token_digest,'hex') end), 'unavailable');
$$;

create function public.open_passport_share(token_digest text, passcode_digest text, page_offset integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  link public.passport_shares%rowtype;
  instant timestamptz;
  failures integer;
  result jsonb;
begin
  if token_digest is null or token_digest !~ '^[0-9a-f]{64}$'
    or page_offset is null or page_offset < 0 then
    return '{"status":"unavailable"}'::jsonb;
  end if;
  select * into link from public.passport_shares s where s.token_hash = decode(token_digest, 'hex') for update;
  instant := clock_timestamp();
  if link.id is null or link.revoked_at is not null or link.expires_at <= instant then
    return '{"status":"unavailable"}'::jsonb;
  end if;

  if link.passcode_hash is not null then
    if link.failed_attempts >= 5 and link.last_failed_at + interval '15 minutes' > instant then
      return '{"status":"locked"}'::jsonb;
    end if;
    if passcode_digest is null then return '{"status":"passcode"}'::jsonb; end if;
    if link.passcode_hash is distinct from
      (case when passcode_digest ~ '^[0-9a-f]{64}$' then decode(passcode_digest, 'hex') end) then
      failures := case when link.last_failed_at + interval '15 minutes' > instant
        then link.failed_attempts + 1 else 1 end;
      update public.passport_shares set failed_attempts = failures, last_failed_at = instant where id = link.id;
      insert into public.passport_share_access (organisation_id, share_id, outcome)
        values (link.organisation_id, link.id, case when failures = 5 then 'rate_limited' else 'incorrect_passcode' end);
      return jsonb_build_object('status', case when failures = 5 then 'locked' else 'incorrect' end);
    end if;
  end if;

  insert into public.passport_share_access (organisation_id, share_id, outcome)
    values (link.organisation_id, link.id, 'opened');
  select jsonb_build_object('status', 'open', 'has_more', count(*) > 50,
    'entries', coalesce(jsonb_agg(jsonb_build_object(
      'record_type', e.record_type, 'operation', e.operation, 'created_at', e.created_at
    ) order by e.sequence desc) filter (where e.ordinal <= 50), '[]'::jsonb))
  into result
  from (
    select subset.*, row_number() over (order by subset.sequence desc) as ordinal
    from (
      select entry.sequence, entry.record_type, entry.operation, entry.created_at
      from public.ledger_entries entry
      where entry.organisation_id = link.organisation_id and (
        link.scope = 'all' or (
          link.scope = 'dates' and entry.created_at >= (link.from_day::timestamp at time zone 'Europe/London')
            and entry.created_at < ((link.through_day + 1)::timestamp at time zone 'Europe/London')
        ) or (
          link.scope = 'people' and exists (
            select 1 from public.ledger_entry_people person
            where person.organisation_id = entry.organisation_id and person.sequence = entry.sequence and
              ((person.person_kind = 'worker' and person.person_id = any(link.worker_ids)) or
               (person.person_kind = 'individual' and person.person_id = any(link.individual_ids)))
          )
        )
      )
      order by entry.sequence desc offset page_offset limit 51
    ) subset
  ) e;
  return result;
end;
$$;

revoke all on function public.issue_passport_share(uuid, uuid, text, text, text, date, uuid[], uuid[], date, date)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_passport_share(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.probe_passport_share(text) from public, anon, authenticated, service_role;
revoke all on function public.open_passport_share(text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.issue_passport_share(uuid, uuid, text, text, text, date, uuid[], uuid[], date, date),
  public.probe_passport_share(text), public.open_passport_share(text, text, integer) to service_role;
grant execute on function public.revoke_passport_share(uuid, uuid) to authenticated;
