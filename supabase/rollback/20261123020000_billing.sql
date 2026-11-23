begin;
drop function public.save_health_checklist(uuid,text[]);
drop table public.health_checklists;
create or replace function sponsor_guard_private.may_read_document_object(path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.jwt() ->> 'aal') = 'aal2' and exists (
    select 1 from public.documents doc
    where doc.object_path = path and doc.state = 'ready'
      and sponsor_guard_private.is_member(doc.organisation_id)
  );
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

create or replace function public.save_audit_pack_checklist(tenant uuid, items text[])
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

create or replace function public.queue_audit_pack(tenant uuid)
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

create or replace function public.claim_audit_pack()
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

create or replace function public.audit_pack_snapshot(job uuid, lease uuid)
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

create or replace function public.finish_audit_pack(job uuid, lease uuid, generated timestamptz, problem text)
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

create or replace function public.issue_passport_share(
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

create or replace function public.probe_passport_share(token_digest text)
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

create or replace function public.open_passport_share(token_digest text, passcode_digest text, page_offset integer)
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

create or replace function public.claim_notification_digests(run_on date, batch_size integer)
returns table (delivery_id uuid, email text, unsubscribe_id uuid, tasks bigint, documents bigint, rtw bigint, personnel bigint)
language sql security definer set search_path = ''
as $$
with latest_rtw as (
  select distinct on (c.organisation_id, c.sponsored_worker_id, c.engaged_individual_id)
    c.organisation_id, c.follow_up_on
  from public.rtw_checks c
  where c.checked_on <= run_on
  order by c.organisation_id, c.sponsored_worker_id, c.engaged_individual_id, c.checked_on desc, c.id desc
), active_threshold as (
  select inactivity_days from public.personnel_inactivity_rules where effective_from <= run_on
  order by effective_from desc limit 1
), items as (
  select t.organisation_id, 'tasks' as topic, false as manager_only
  from public.tasks t join public.reporting_events e on (e.organisation_id, e.id) = (t.organisation_id, t.reporting_event_id)
  where not t.completed and e.due_on <= run_on
  union all
  select organisation_id, 'tasks', true from public.personnel_handover_tasks where not completed
  union all
  select organisation_id, 'documents', false from public.documents
  where state = 'ready' and expires_on in (run_on + 90, run_on + 30, run_on + 7)
  union all
  select organisation_id, 'rtw', false from latest_rtw where follow_up_on <= run_on
  union all
  select p.organisation_id, 'personnel', true from public.key_personnel p cross join active_threshold t
  where not p.leaving and p.sms_last_login_on <= run_on - t.inactivity_days
  union all
  select o.id, 'personnel', true from public.organisations o
  cross join (values ('Authorising Officer'), ('Key Contact'), ('Level 1 user')) as roles(role)
  where not exists (
    select 1 from public.key_personnel p where p.organisation_id = o.id and p.role = roles.role and not p.leaving
  )
), counts as (
  select organisation_id, topic, manager_only, count(*) as total from items group by 1, 2, 3
), candidates as (
  select p.user_id, u.email::text, p.unsubscribe_id,
    coalesce(sum(c.total) filter (where c.topic = 'tasks'), 0)::bigint as tasks,
    coalesce(sum(c.total) filter (where c.topic = 'documents'), 0)::bigint as documents,
    coalesce(sum(c.total) filter (where c.topic = 'rtw'), 0)::bigint as rtw,
    coalesce(sum(c.total) filter (where c.topic = 'personnel'), 0)::bigint as personnel
  from public.notification_preferences p
  join auth.users u on u.id = p.user_id
  join public.memberships m on m.user_id = p.user_id
  join counts c on c.organisation_id = m.organisation_id and (not c.manager_only or m.role in ('owner', 'admin'))
  where p.enabled and u.email_confirmed_at is not null and nullif(u.email, '') is not null
    and case c.topic when 'tasks' then p.tasks when 'documents' then p.documents
      when 'rtw' then p.rtw when 'personnel' then p.personnel else false end
    and not exists (
      select 1 from public.notification_digest_deliveries d where d.user_id = p.user_id and d.digest_day = run_on
    )
  group by p.user_id, u.email, p.unsubscribe_id
  order by p.user_id
  limit least(greatest(coalesce(batch_size, 0), 0), 100)
), claimed as (
  insert into public.notification_digest_deliveries (user_id, digest_day)
  select c.user_id, run_on from candidates c order by c.user_id
  on conflict (user_id, digest_day) do nothing
  returning id, user_id
)
select d.id, c.email, c.unsubscribe_id, c.tasks, c.documents, c.rtw, c.personnel
from claimed d join candidates c using (user_id) order by d.id;
$$;
drop policy billing_engaged_checks on public.rtw_checks;
drop policy billing_engaged_documents on public.documents;
drop policy billing_engaged_reminders on public.document_notifications;
drop policy billing_ledger_sources on public.ledger_entries;
drop policy billing_audit_pack_contents on public.audit_pack_jobs;
alter table public.audit_pack_jobs drop column requires_pro;

do $$
declare relation text;
begin
  foreach relation in array array['sponsored_workers', 'cos_records', 'reporting_events', 'tasks', 'documents',
    'document_notifications', 'rtw_checks', 'ledger_entries', 'audit_pack_jobs', 'audit_pack_settings',
    'reporting_rules', 'bank_holiday_years', 'bank_holidays', 'notification_preferences'] loop
    execute format('drop policy billing_paid on public.%I', relation);
  end loop;
  foreach relation in array array['engaged_individuals', 'engagement_categories', 'key_personnel',
    'personnel_handover_tasks', 'passport_shares', 'passport_share_access', 'personnel_inactivity_rules'] loop
    execute format('drop policy billing_pro on public.%I', relation);
  end loop;
end;
$$;
drop trigger documents_billing on public.documents;
drop trigger sponsored_workers_quota on public.sponsored_workers;
drop trigger organisation_billing_setup on public.organisations;
drop function sponsor_guard_private.guard_billed_document();
drop function sponsor_guard_private.enforce_worker_quota();
drop function sponsor_guard_private.seed_org_billing();
drop function public.workspace_billing(uuid);
drop function public.stripe_customer_for(uuid);
drop function public.bind_stripe_customer(uuid,text);
drop function public.reserve_stripe_checkout(uuid,text);
drop function public.begin_stripe_observation(text,text);
drop function public.apply_stripe_observation(text,text,text,bigint,text,text);
drop function public.release_stripe_checkout(text,uuid);
drop function public.release_stripe_observation(text,bigint);
drop function sponsor_guard_private.has_any_plan(text);
drop function sponsor_guard_private.has_plan(uuid,text);
drop function sponsor_guard_private.worker_limit(text);
drop sequence sponsor_guard_private.stripe_observation_revision;
drop table public.stripe_webhook_events, public.stripe_subscriptions, public.organisation_billing;
commit;
