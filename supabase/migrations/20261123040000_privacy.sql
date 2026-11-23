create table public.privacy_retention_rules (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  kind text not null check (kind in ('worker','individual','personnel')),
  effective_from date not null check (isfinite(effective_from)),
  retention_days integer check (retention_days between 1 and 36500),
  source_reference text not null check (char_length(btrim(source_reference)) between 1 and 250),
  primary key (organisation_id, kind, effective_from)
);
create table public.privacy_person_controls (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  kind text not null check (kind in ('worker','individual','personnel')),
  person_id uuid not null,
  started_on date check (isfinite(started_on)),
  held boolean not null default false,
  primary key (organisation_id, kind, person_id)
);
create table public.privacy_access_log (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  action text not null check (action in ('export_json','export_pdf','document_link','audit_pack_link',
    'manual_erasure','retention_erasure','retention_configured','person_controls_changed')),
  kind text check (kind in ('worker','individual','personnel')),
  occurred_at timestamptz not null default clock_timestamp()
);
create index privacy_log_recent on public.privacy_access_log (organisation_id, occurred_at desc);
create table public.privacy_storage_cleanup (
  organisation_id uuid not null,
  bucket text not null check (bucket in ('sponsorguard-documents','sponsorguard-audit-packs')),
  path text not null check (split_part(path,'/',1) = organisation_id::text),
  next_attempt_at timestamptz not null default now(),
  lease uuid,
  attempts integer not null default 0,
  primary key (bucket, path)
);
create index privacy_cleanup_due on public.privacy_storage_cleanup(next_attempt_at);

do $$
declare item text;
begin
  foreach item in array array['privacy_retention_rules','privacy_person_controls','privacy_access_log','privacy_storage_cleanup'] loop
    execute format('alter table public.%I enable row level security', item);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', item);
  end loop;
  foreach item in array array['privacy_retention_rules','privacy_person_controls','privacy_access_log'] loop
    execute format('grant select on public.%I to authenticated', item);
    execute format('create policy privacy_native_managers on public.%I for select to authenticated using (
      (select auth.jwt() ->> ''aal'') = ''aal2'' and sponsor_guard_private.has_direct_role(organisation_id,''owner'',''admin''))', item);
  end loop;
end;
$$;
create trigger privacy_rules_append_only before update or truncate on public.privacy_retention_rules
  for each statement execute function sponsor_guard_private.guard_reporting_rule_history();

alter table public.audit_pack_jobs drop constraint audit_pack_jobs_failure_check;
alter table public.audit_pack_jobs add constraint audit_pack_jobs_failure_check check
  (failure in ('too_large','document_unavailable','generation_failed','access_changed','privacy_erasure'));

create function sponsor_guard_private.person_row(tenant uuid, target_kind text, person uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select case target_kind
    when 'worker' then (select to_jsonb(w) - 'organisation_id' from public.sponsored_workers w where w.organisation_id = tenant and w.id = person)
    when 'individual' then (select to_jsonb(p) - 'organisation_id' from public.engaged_individuals p where p.organisation_id = tenant and p.id = person)
    when 'personnel' then (select to_jsonb(k) - 'organisation_id' from public.key_personnel k where k.organisation_id = tenant and k.id = person)
  end;
$$;

create function sponsor_guard_private.lock_privacy_tenant(tenant uuid)
returns void language sql set search_path = ''
as $$ select pg_advisory_xact_lock(hashtextextended('privacy:' || tenant::text,0)) $$;
revoke all on function sponsor_guard_private.person_row(uuid,text,uuid), sponsor_guard_private.lock_privacy_tenant(uuid)
  from public, anon, authenticated, service_role;

create function public.privacy_people(tenant uuid)
returns table (kind text, id uuid, full_name text, started_on date, held boolean)
language sql stable security definer set search_path = ''
as $$
  select p.kind, p.id, p.full_name, c.started_on, coalesce(c.held,false)
  from (
    select 'worker' as kind, w.id, w.full_name from public.sponsored_workers w where w.organisation_id = tenant
    union all select 'individual', i.id, i.full_name from public.engaged_individuals i where i.organisation_id = tenant
    union all select 'personnel', k.id, k.full_name from public.key_personnel k where k.organisation_id = tenant
  ) p left join public.privacy_person_controls c
    on (c.organisation_id,c.kind,c.person_id) = (tenant,p.kind,p.id)
  where (select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_direct_role(tenant,'owner','admin');
$$;

create function public.set_privacy_retention(tenant uuid, target_kind text, effective date, days integer, source text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' or not sponsor_guard_private.has_direct_role(tenant,'owner') then
    raise exception 'Privacy settings access denied.' using errcode = '42501';
  end if;
  perform sponsor_guard_private.lock_privacy_tenant(tenant);
  -- A new version cannot replace a prior effective date.
  if exists (select 1 from public.privacy_retention_rules where organisation_id = tenant and kind = target_kind and effective_from >= effective) then
    raise exception 'Choose a later effective date for the new version.' using errcode = '22023';
  end if;
  insert into public.privacy_retention_rules values (tenant,target_kind,effective,days,btrim(source));
  insert into public.privacy_access_log (organisation_id,action,kind) values (tenant,'retention_configured',target_kind);
end;
$$;

create function public.set_privacy_person(tenant uuid, target_kind text, person uuid, start_date date, hold boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' or not sponsor_guard_private.has_direct_role(tenant,'owner') then
    raise exception 'Privacy settings access denied.' using errcode = '42501';
  end if;
  perform sponsor_guard_private.lock_privacy_tenant(tenant);
  if sponsor_guard_private.person_row(tenant,target_kind,person) is null then
    raise exception 'Person unavailable.' using errcode = '22023';
  end if;
  insert into public.privacy_person_controls values (tenant,target_kind,person,start_date,hold)
    on conflict (organisation_id,kind,person_id) do update set started_on = excluded.started_on, held = excluded.held;
  insert into public.privacy_access_log (organisation_id,action,kind) values (tenant,'person_controls_changed',target_kind);
end;
$$;

create function public.export_privacy_person(tenant uuid, target_kind text, person uuid, format_type text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare subject jsonb;
declare result jsonb;
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' or not sponsor_guard_private.has_direct_role(tenant,'owner','admin') then
    raise exception 'Person export access denied.' using errcode = '42501';
  end if;
  if format_type is null or format_type not in ('json','pdf') then
    raise exception 'Unknown format.' using errcode = '22023';
  end if;
  perform sponsor_guard_private.lock_privacy_tenant(tenant);
  subject := sponsor_guard_private.person_row(tenant,target_kind,person);
  if subject is null then return null; end if;
  select jsonb_build_object(
    'person', subject, 'kind', target_kind, 'exported_at', clock_timestamp(),
    'right_to_work_checks', (select coalesce(jsonb_agg(to_jsonb(c) - 'organisation_id' order by c.checked_on,c.id),'[]')
      from public.rtw_checks c where c.organisation_id = tenant and
        ((target_kind = 'worker' and c.sponsored_worker_id = person) or (target_kind = 'individual' and c.engaged_individual_id = person))),
    'certificates_of_sponsorship', (select coalesce(jsonb_agg(to_jsonb(c) - 'organisation_id' order by c.assigned_on,c.id),'[]')
      from public.cos_records c where c.organisation_id = tenant and target_kind = 'worker' and c.sponsored_worker_id = person),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'document_type',d.document_type,
      'issued_on',d.issued_on,'expires_on',d.expires_on,'content_type',d.content_type,'size_bytes',d.size_bytes,
      'scan_status',d.scan_status,'created_at',d.created_at) order by d.id),'[]')
      from public.documents d where d.organisation_id = tenant and d.state = 'ready' and
        ((target_kind = 'worker' and d.sponsored_worker_id = person) or (target_kind = 'individual' and d.engaged_individual_id = person))),
    'handover_tasks', (select coalesce(jsonb_agg(jsonb_build_object('step',t.step,'completed',t.completed) order by t.step),'[]')
      from public.personnel_handover_tasks t where t.organisation_id = tenant and target_kind = 'personnel' and t.personnel_id = person),
    'retention_controls', (select jsonb_build_object('started_on',c.started_on,'held',c.held)
      from public.privacy_person_controls c where (c.organisation_id,c.kind,c.person_id) = (tenant,target_kind,person))
  ) into result;
  insert into public.privacy_access_log (organisation_id,action,kind) values (tenant,'export_' || format_type,target_kind);
  return result;
end;
$$;

create function sponsor_guard_private.erase_person_records(tenant uuid, target_kind text, person uuid, reason text, as_of date default null)
returns boolean language plpgsql set search_path = ''
as $$
begin
  perform sponsor_guard_private.lock_privacy_tenant(tenant);
  if sponsor_guard_private.person_row(tenant,target_kind,person) is null then
    delete from public.privacy_person_controls c where (c.organisation_id,c.kind,c.person_id) = (tenant,target_kind,person);
    return false;
  end if;
  if exists (select 1 from public.privacy_person_controls c where (c.organisation_id,c.kind,c.person_id) = (tenant,target_kind,person) and c.held)
    then return false; end if;
  if as_of is not null and not exists (
    select 1 from public.privacy_person_controls c
    cross join lateral (select r.retention_days from public.privacy_retention_rules r
      where r.organisation_id = tenant and r.kind = target_kind and r.effective_from <= as_of
      order by r.effective_from desc limit 1) version
    where (c.organisation_id,c.kind,c.person_id) = (tenant,target_kind,person)
      and c.started_on <= as_of - version.retention_days
  ) then return false; end if;

  -- Queue file removal in the same transaction that cuts off read access.
  insert into public.privacy_storage_cleanup(organisation_id,bucket,path)
    select tenant,'sponsorguard-documents',d.object_path from public.documents d where d.organisation_id = tenant
      and ((target_kind = 'worker' and d.sponsored_worker_id = person) or (target_kind = 'individual' and d.engaged_individual_id = person))
    union all
    select tenant,'sponsorguard-audit-packs',tenant::text || '/' || j.id::text || '/' || j.attempt::text || '.zip'
      from public.audit_pack_jobs j where j.organisation_id = tenant and j.attempt is not null and j.status in ('ready','running')
    on conflict (bucket,path) do nothing;
  -- Historical packs have no subject manifest in Postgres. Invalidate all earlier copies for this tenant.
  update public.audit_pack_jobs set status = 'failed', failure = 'privacy_erasure', generated_at = null, lease_until = null
    where organisation_id = tenant and status in ('ready','running');
  update public.passport_shares set revoked_at = clock_timestamp() where organisation_id = tenant and revoked_at is null
    and ((target_kind = 'worker' and person = any(worker_ids)) or (target_kind = 'individual' and person = any(individual_ids)));

  delete from public.documents d where d.organisation_id = tenant
    and ((target_kind = 'worker' and d.sponsored_worker_id = person) or (target_kind = 'individual' and d.engaged_individual_id = person));
  if target_kind = 'worker' then
    delete from public.sponsored_workers where organisation_id = tenant and id = person;
  elsif target_kind = 'individual' then
    delete from public.engaged_individuals where organisation_id = tenant and id = person;
  elsif target_kind = 'personnel' then
    delete from public.personnel_handover_tasks where organisation_id = tenant and personnel_id = person;
    delete from public.key_personnel where organisation_id = tenant and id = person;
  end if;
  delete from public.privacy_person_controls c where (c.organisation_id,c.kind,c.person_id) = (tenant,target_kind,person);
  insert into public.privacy_access_log (organisation_id,action,kind) values (tenant,reason,target_kind);
  return true;
end;
$$;
revoke all on function sponsor_guard_private.erase_person_records(uuid,text,uuid,text,date)
  from public, anon, authenticated, service_role;

create function public.erase_privacy_person(tenant uuid, target_kind text, person uuid, confirmation text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' or not sponsor_guard_private.has_direct_role(tenant,'owner') then
    raise exception 'Erasure access denied.' using errcode = '42501';
  end if;
  if confirmation is distinct from 'ERASE' then raise exception 'Confirmation required.' using errcode = '22023'; end if;
  return sponsor_guard_private.erase_person_records(tenant,target_kind,person,'manual_erasure');
end;
$$;

create function public.purge_privacy_due(run_on date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare c record;
declare erased integer := 0;
begin
  for c in
    select control.organisation_id, control.kind, control.person_id
    from public.privacy_person_controls control
    cross join lateral (select retention_days from public.privacy_retention_rules r
      where r.organisation_id = control.organisation_id and r.kind = control.kind and r.effective_from <= run_on
      order by r.effective_from desc limit 1) active
    where not control.held and control.started_on <= run_on - active.retention_days
    order by control.organisation_id, control.kind, control.person_id limit 100
  loop
    if sponsor_guard_private.erase_person_records(c.organisation_id,c.kind,c.person_id,'retention_erasure',run_on)
      then erased := erased + 1; end if;
  end loop;
  return erased;
end;
$$;

create function public.privacy_pending_storage(tenant uuid)
returns bigint language sql stable security definer set search_path = ''
as $$
  select count(*) from public.privacy_storage_cleanup where organisation_id = tenant
    and (select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_direct_role(tenant,'owner','admin');
$$;

create function public.claim_privacy_storage()
returns table (bucket text, path text, lease uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  -- Cover late uploads from an invalidated job or an interrupted vault upload.
  insert into public.privacy_storage_cleanup(organisation_id,bucket,path)
    select split_part(o.name,'/',1)::uuid,o.bucket_id,o.name from storage.objects o
    where o.bucket_id in ('sponsorguard-documents','sponsorguard-audit-packs')
      and o.name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/'
      and o.created_at < now() - interval '20 minutes'
      and ((o.bucket_id = 'sponsorguard-documents' and not exists (
        select 1 from public.documents d where d.object_path = o.name))
      or (o.bucket_id = 'sponsorguard-audit-packs' and not exists (
        select 1 from public.audit_pack_jobs j where j.status in ('ready','running')
          and j.organisation_id::text || '/' || j.id::text || '/' || j.attempt::text || '.zip' = o.name)))
    limit 500 on conflict do nothing;
  return query with due as (
    select q.bucket,q.path from public.privacy_storage_cleanup q
    where q.next_attempt_at <= now() order by q.next_attempt_at,q.bucket,q.path limit 100 for update skip locked
  )
  update public.privacy_storage_cleanup q set lease = gen_random_uuid(),
    next_attempt_at = now() + interval '10 minutes', attempts = q.attempts + 1
  from due d where (q.bucket,q.path) = (d.bucket,d.path)
  returning q.bucket,q.path,q.lease;
end;
$$;

create function public.finish_privacy_storage(target_bucket text, target_path text, claim uuid)
returns void language sql security definer set search_path = ''
as $$
  delete from public.privacy_storage_cleanup where (bucket,path,lease) = (target_bucket,target_path,claim);
$$;

create function public.log_privacy_download(tenant uuid, download_kind text, item uuid, actor uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare member_role public.membership_role := sponsor_guard_private.workspace_role(tenant,actor);
begin
  if download_kind = 'document_link' and member_role is not null and exists (
    select 1 from public.documents d where d.organisation_id = tenant and d.id = item and d.state = 'ready'
    and sponsor_guard_private.has_plan(tenant,case when d.engaged_individual_id is null then 'core' else 'pro' end)
  ) or download_kind = 'audit_pack_link' and member_role in ('owner','admin') and exists (
    select 1 from public.audit_pack_jobs j where j.organisation_id = tenant and j.id = item and j.status = 'ready'
    and sponsor_guard_private.has_plan(tenant,case when j.requires_pro then 'pro' else 'core' end)
  ) then
    insert into public.privacy_access_log (organisation_id,action) values (tenant,download_kind);
  else
    raise exception 'Download access denied.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.privacy_people(uuid), public.set_privacy_retention(uuid,text,date,integer,text),
  public.set_privacy_person(uuid,text,uuid,date,boolean), public.export_privacy_person(uuid,text,uuid,text),
  public.erase_privacy_person(uuid,text,uuid,text), public.purge_privacy_due(date), public.privacy_pending_storage(uuid),
  public.claim_privacy_storage(), public.finish_privacy_storage(text,text,uuid), public.log_privacy_download(uuid,text,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.privacy_people(uuid), public.set_privacy_retention(uuid,text,date,integer,text),
  public.set_privacy_person(uuid,text,uuid,date,boolean), public.export_privacy_person(uuid,text,uuid,text),
  public.erase_privacy_person(uuid,text,uuid,text), public.privacy_pending_storage(uuid)
  to authenticated;
grant execute on function public.purge_privacy_due(date), public.claim_privacy_storage(), public.finish_privacy_storage(text,text,uuid),
  public.log_privacy_download(uuid,text,uuid,uuid) to service_role;

create function public.privacy_recent_access(tenant uuid)
returns table (action text, kind text, occurred_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.action,e.kind,e.occurred_at from (
    select log.action,log.kind,log.occurred_at from public.privacy_access_log log where log.organisation_id = tenant
    union all
    select 'passport_' || access.outcome,null::text,access.accessed_at from public.passport_share_access access
      where access.organisation_id = tenant
  ) e where (select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_direct_role(tenant,'owner','admin')
  order by e.occurred_at desc limit 100;
$$;
revoke all on function public.privacy_recent_access(uuid) from public, anon, authenticated, service_role;
grant execute on function public.privacy_recent_access(uuid) to authenticated;
