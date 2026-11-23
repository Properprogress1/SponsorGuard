insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sponsorguard-audit-packs', 'sponsorguard-audit-packs', false, 47185920, array['application/zip']);

create table public.audit_pack_settings (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  checklist text[] not null check (
    array_ndims(checklist) is null or (array_ndims(checklist) = 1 and cardinality(checklist) <= 30
      and array_position(checklist, null) is null
      and char_length(array_to_string(checklist, '')) <= 3600
      and array_to_string(checklist, '') !~ '[[:cntrl:]]')
  )
);
create table public.audit_pack_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  checklist text[] not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed')),
  requested_at timestamptz not null default now(),
  lease_until timestamptz,
  attempt uuid,
  attempts integer not null default 0,
  generated_at timestamptz,
  failure text check (failure in ('too_large', 'document_unavailable', 'generation_failed', 'access_changed'))
);
create unique index audit_pack_one_active on public.audit_pack_jobs (organisation_id) where status in ('queued', 'running');
create index audit_pack_recent on public.audit_pack_jobs (organisation_id, requested_at desc);
create index audit_pack_pending on public.audit_pack_jobs (requested_at) where status in ('queued', 'running');

alter table public.audit_pack_settings enable row level security;
alter table public.audit_pack_jobs enable row level security;
revoke all on public.audit_pack_settings, public.audit_pack_jobs from public, anon, authenticated, service_role;
grant select on public.audit_pack_settings to authenticated;
grant select (id, organisation_id, status, requested_at, generated_at, attempt, failure) on public.audit_pack_jobs to authenticated;

create policy audit_pack_settings_managers on public.audit_pack_settings for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'));
create policy audit_pack_jobs_managers on public.audit_pack_jobs for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'));

create function public.save_audit_pack_checklist(tenant uuid, items text[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (auth.jwt() ->> 'aal') is distinct from 'aal2' or not sponsor_guard_private.has_role(tenant, 'owner', 'admin') then
    raise exception 'Audit pack access denied.' using errcode = '42501';
  end if;
  if items is null or exists (select 1 from unnest(items) item where char_length(btrim(item)) not between 1 and 120) then
    raise exception 'Invalid audit pack checklist.' using errcode = '22023';
  end if;
  insert into public.audit_pack_settings (organisation_id, checklist) values (tenant, items)
  on conflict (organisation_id) do update set checklist = excluded.checklist;
end;
$$;

create function public.queue_audit_pack(tenant uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare job uuid;
begin
  if (auth.jwt() ->> 'aal') is distinct from 'aal2' or not sponsor_guard_private.has_role(tenant, 'owner', 'admin') then
    raise exception 'Audit pack access denied.' using errcode = '42501';
  end if;
  insert into public.audit_pack_jobs (organisation_id, requested_by, checklist)
  values (tenant, auth.uid(), coalesce((select checklist from public.audit_pack_settings where organisation_id = tenant),
    array['Check the worker register', 'Review follow-up dates', 'Review the document list and ledger summary']))
  on conflict (organisation_id) where status in ('queued', 'running') do nothing returning id into job;
  return job;
end;
$$;

create function sponsor_guard_private.check_audit_ledger(tenant uuid)
returns table (valid boolean, checked_entries bigint, first_invalid_sequence bigint)
language sql stable set search_path = ''
as $$
  with ordered as (
    select e.*, row_number() over chain as expected_sequence,
      lag(e.entry_hash, 1, decode(repeat('00', 32), 'hex')) over chain as expected_previous
    from public.ledger_entries e where e.organisation_id = tenant
    window chain as (order by e.sequence)
  ), result as (
    select count(*) as checked, min(o.sequence) filter (
      where o.sequence <> o.expected_sequence
        or o.prev_hash is distinct from o.expected_previous
        or o.entry_hash is distinct from sponsor_guard_private.ledger_hash(o.prev_hash, o.metadata, o.created_at, o.record_id)
    ) as first_invalid from ordered o
  )
  select first_invalid is null, checked, first_invalid from result;
$$;

create or replace function public.verify_chain(tenant uuid)
returns table (valid boolean, checked_entries bigint, first_invalid_sequence bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (auth.jwt() ->> 'aal') is distinct from 'aal2'
    or not sponsor_guard_private.is_member(tenant) then
    raise exception 'Ledger access denied.' using errcode = '42501';
  end if;
  return query select * from sponsor_guard_private.check_audit_ledger(tenant);
end;
$$;

create function public.claim_audit_pack()
returns table (id uuid, organisation_id uuid, attempt uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  update public.audit_pack_jobs j set status = 'failed', lease_until = null,
    failure = case when j.attempts >= 3 then 'generation_failed' else 'access_changed' end
  where (j.status = 'queued' or (j.status = 'running' and j.lease_until <= now()))
    and (j.attempts >= 3 or not exists (
      select 1 from public.memberships m where m.organisation_id = j.organisation_id
      and m.user_id = j.requested_by and m.role in ('owner', 'admin')
    ));
  return query
    with candidate as (
      select j.id from public.audit_pack_jobs j
      where j.status = 'queued' or (j.status = 'running' and j.lease_until <= now())
      order by j.requested_at, j.id limit 1 for update skip locked
    )
    update public.audit_pack_jobs j set status = 'running', lease_until = now() + interval '10 minutes',
      attempt = gen_random_uuid(), attempts = j.attempts + 1
    from candidate c where j.id = c.id returning j.id, j.organisation_id, j.attempt;
end;
$$;

create function public.audit_pack_snapshot(job uuid, lease uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
select jsonb_build_object(
 'name', o.name, 'generated_at', now(), 'checklist', j.checklist,
 'workers', (select coalesce(jsonb_agg(w order by w.reference), '[]') from (
    select reference, full_name, status from public.sponsored_workers where organisation_id = o.id
  ) w),
 'individuals', (select coalesce(jsonb_agg(p order by p.reference), '[]') from (
    select i.reference, i.full_name, c.label as category from public.engaged_individuals i
    join public.engagement_categories c on (c.organisation_id, c.key) = (i.organisation_id, i.engagement_type)
    where i.organisation_id = o.id
  ) p),
 'checks', (select coalesce(jsonb_agg(c order by c.checked_on, c.id), '[]') from (
    select r.id, coalesce(w.reference, p.reference) as person_reference,
      case when r.sponsored_worker_id is not null then 'Sponsored worker' else 'Engaged individual' end as person_type,
      r.checked_on, r.method, r.follow_up_on from public.rtw_checks r
    left join public.sponsored_workers w on (w.organisation_id, w.id) = (r.organisation_id, r.sponsored_worker_id)
    left join public.engaged_individuals p on (p.organisation_id, p.id) = (r.organisation_id, r.engaged_individual_id)
    where r.organisation_id = o.id
  ) c),
 'reporting', (select coalesce(jsonb_agg(e order by e.event_on, e.id), '[]') from (
    select e.id, e.event_on, e.due_on, r.description, r.version, t.completed
    from public.reporting_events e join public.reporting_rules r on e.reporting_rule_id = r.id
    left join public.tasks t on (t.organisation_id, t.reporting_event_id) = (e.organisation_id, e.id)
    where e.organisation_id = o.id
  ) e),
 'personnel', (select coalesce(jsonb_agg(p order by p.role, p.full_name), '[]') from (
    select role, full_name, sms_mfa, sms_last_login_on, leaving from public.key_personnel where organisation_id = o.id
  ) p),
 'documents', (select coalesce(jsonb_agg(d order by d.id), '[]') from (
    select d.id, d.document_type, d.issued_on, d.expires_on, d.content_type, d.size_bytes,
      coalesce(w.reference, p.reference) as person_reference,
      case when d.sponsored_worker_id is not null then 'Sponsored worker' else 'Engaged individual' end as person_type
    from public.documents d
    left join public.sponsored_workers w on (w.organisation_id, w.id) = (d.organisation_id, d.sponsored_worker_id)
    left join public.engaged_individuals p on (p.organisation_id, p.id) = (d.organisation_id, d.engaged_individual_id)
    where d.organisation_id = o.id and d.state = 'ready'
  ) d),
 'ledger', (select to_jsonb(v) from sponsor_guard_private.check_audit_ledger(o.id) v)
)
from public.audit_pack_jobs j join public.organisations o on o.id = j.organisation_id
where j.id = job and j.attempt = lease and j.status = 'running' and j.lease_until > now()
and exists (select 1 from public.memberships m where m.organisation_id = j.organisation_id
  and m.user_id = j.requested_by and m.role in ('owner', 'admin'));
$$;

create function public.finish_audit_pack(job uuid, lease uuid, generated timestamptz, problem text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  update public.audit_pack_jobs j set status = case when problem is null then 'ready' else 'failed' end,
    lease_until = null, generated_at = case when problem is null then generated end, failure = problem
  where j.id = job and j.attempt = lease and j.status = 'running' and j.lease_until > now()
  and (problem is not null or (generated is not null and exists (
    select 1 from public.memberships m where m.organisation_id = j.organisation_id
      and m.user_id = j.requested_by and m.role in ('owner', 'admin')
  )));
  return found;
end;
$$;

revoke all on function sponsor_guard_private.check_audit_ledger(uuid), public.queue_audit_pack(uuid),
  public.save_audit_pack_checklist(uuid, text[]), public.claim_audit_pack(), public.audit_pack_snapshot(uuid, uuid),
  public.finish_audit_pack(uuid, uuid, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.queue_audit_pack(uuid), public.save_audit_pack_checklist(uuid, text[]) to authenticated;
grant execute on function public.claim_audit_pack(), public.audit_pack_snapshot(uuid, uuid),
  public.finish_audit_pack(uuid, uuid, timestamptz, text) to service_role;
