create type public.ledger_record_type as enum ('rtw_checks', 'reporting_events', 'documents', 'key_personnel');
create type public.ledger_operation as enum ('created', 'updated', 'deleted');

create function sponsor_guard_private.ledger_metadata(
  tenant uuid, entry_no bigint, source public.ledger_record_type, operation public.ledger_operation
) returns jsonb language sql immutable strict set search_path = ''
as $$
  select jsonb_build_object('operation', operation::text, 'organisation_id', tenant,
    'record_type', source::text, 'sequence', entry_no);
$$;

create table public.ledger_entries (
  organisation_id uuid not null references public.organisations(id),
  sequence bigint not null check (sequence > 0),
  record_id uuid not null,
  record_type public.ledger_record_type not null,
  operation public.ledger_operation not null,
  metadata jsonb generated always as (
    sponsor_guard_private.ledger_metadata(organisation_id, sequence, record_type, operation)
  ) stored,
  created_at timestamptz not null check (isfinite(created_at)),
  prev_hash bytea not null check (octet_length(prev_hash) = 32),
  entry_hash bytea not null check (octet_length(entry_hash) = 32),
  primary key (organisation_id, sequence)
);
alter table public.ledger_entries enable row level security;
revoke all on public.ledger_entries from public, anon, authenticated, service_role;
grant select on public.ledger_entries to authenticated, service_role;
create policy ledger_members_read on public.ledger_entries for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.is_member(organisation_id));

create function sponsor_guard_private.ledger_hash(
  previous bytea, details jsonb, recorded_at timestamptz, reference uuid
) returns bytea language sql stable strict set search_path = ''
as $$
  select sha256(previous || convert_to(
    format('{"operation":%s,"organisation_id":%s,"record_type":%s,"sequence":%s}',
      details -> 'operation', details -> 'organisation_id', details -> 'record_type', details -> 'sequence')
    || to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    || reference::text, 'UTF8'));
$$;

create function sponsor_guard_private.block_ledger_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'Ledger entries are append-only.' using errcode = '55000';
end;
$$;
create trigger ledger_append_only before update or delete or truncate on public.ledger_entries
  for each statement execute function sponsor_guard_private.block_ledger_mutation();

create function sponsor_guard_private.append_ledger_entry(
  tenant uuid, reference uuid, source public.ledger_record_type, change public.ledger_operation
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  last_entry public.ledger_entries%rowtype;
  entry_no bigint;
  previous bytea;
  recorded_at timestamptz;
begin
  -- Serialise appenders within one organisation until their source transaction commits.
  perform pg_advisory_xact_lock(hashtextextended('sponsorguard-ledger:' || tenant::text, 0));
  select * into last_entry from public.ledger_entries
    where organisation_id = tenant order by sequence desc limit 1;
  entry_no := coalesce(last_entry.sequence, 0) + 1;
  previous := coalesce(last_entry.entry_hash, decode(repeat('00', 32), 'hex'));
  recorded_at := clock_timestamp();
  insert into public.ledger_entries (organisation_id, sequence, record_id, record_type,
    operation, created_at, prev_hash, entry_hash)
  values (tenant, entry_no, reference, source, change, recorded_at, previous,
    sponsor_guard_private.ledger_hash(previous,
      sponsor_guard_private.ledger_metadata(tenant, entry_no, source, change), recorded_at, reference));
end;
$$;

create function sponsor_guard_private.capture_ledger_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  change public.ledger_operation;
  tenant uuid;
  reference uuid;
begin
  if tg_op = 'UPDATE' and old is not distinct from new then return null; end if;
  if tg_table_name = 'documents' then
    if tg_op <> 'DELETE' and new.state <> 'ready' then return null; end if;
    if tg_op = 'DELETE' and old.state <> 'ready' then return null; end if;
  end if;

  if tg_op = 'DELETE' then
    tenant := old.organisation_id;
    reference := old.id;
    change := 'deleted';
  else
    tenant := new.organisation_id;
    reference := new.id;
    change := case
      when tg_op = 'INSERT' then 'created'::public.ledger_operation
      else 'updated'::public.ledger_operation
    end;
    if tg_table_name = 'documents' and tg_op = 'UPDATE' then
      if old.state <> 'ready' then change := 'created'; end if;
    end if;
  end if;
  perform sponsor_guard_private.append_ledger_entry(tenant, reference, tg_table_name::public.ledger_record_type, change);
  return null;
end;
$$;

create trigger rtw_ledger after insert or update or delete on public.rtw_checks
  for each row execute function sponsor_guard_private.capture_ledger_change();
create trigger reporting_ledger after insert or update or delete on public.reporting_events
  for each row execute function sponsor_guard_private.capture_ledger_change();
create trigger documents_ledger after insert or update or delete on public.documents
  for each row execute function sponsor_guard_private.capture_ledger_change();
create trigger key_personnel_ledger after insert or update or delete on public.key_personnel
  for each row execute function sponsor_guard_private.capture_ledger_change();

revoke all on function sponsor_guard_private.ledger_metadata(uuid, bigint, public.ledger_record_type, public.ledger_operation)
  from public, anon, authenticated, service_role;
revoke all on function sponsor_guard_private.ledger_hash(bytea, jsonb, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function sponsor_guard_private.block_ledger_mutation()
  from public, anon, authenticated, service_role;
revoke all on function sponsor_guard_private.append_ledger_entry(uuid, uuid, public.ledger_record_type, public.ledger_operation)
  from public, anon, authenticated, service_role;
revoke all on function sponsor_guard_private.capture_ledger_change()
  from public, anon, authenticated, service_role;

create function public.verify_chain(tenant uuid)
returns table (valid boolean, checked_entries bigint, first_invalid_sequence bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (auth.jwt() ->> 'aal') is distinct from 'aal2'
    or not sponsor_guard_private.is_member(tenant) then
    raise exception 'Ledger access denied.' using errcode = '42501';
  end if;
  return query
    with ordered as (
      select e.*, row_number() over chain as expected_sequence,
        lag(e.entry_hash, 1, decode(repeat('00', 32), 'hex')) over chain as expected_previous
      from public.ledger_entries e
      where e.organisation_id = tenant
      window chain as (order by e.sequence)
    ), result as (
      select count(*) as checked, min(o.sequence) filter (
        where o.sequence <> o.expected_sequence
          or o.prev_hash is distinct from o.expected_previous
          or o.entry_hash is distinct from sponsor_guard_private.ledger_hash(o.prev_hash, o.metadata, o.created_at, o.record_id)
      ) as first_invalid
      from ordered o
    )
    select first_invalid is null, checked, first_invalid from result;
end;
$$;
revoke all on function public.verify_chain(uuid) from public, anon, authenticated, service_role;
grant execute on function public.verify_chain(uuid) to authenticated;
