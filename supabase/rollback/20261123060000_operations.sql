begin;
drop function public.recover_interrupted_evidence();
drop function public.review_evidence_request(uuid,uuid,text);
drop function public.finish_evidence_upload(text,uuid,boolean);
drop function public.reserve_evidence_upload(text,text,integer);
create or replace function public.export_privacy_person(tenant uuid, target_kind text, person uuid, format_type text)
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

insert into public.privacy_storage_cleanup(organisation_id,bucket,path)
  select d.organisation_id,'sponsorguard-documents',d.object_path
  from public.documents d join public.evidence_requests r on r.document_id = d.id
  where d.state = 'pending'
  on conflict do nothing;
delete from public.documents d using public.evidence_requests r
  where r.document_id = d.id and d.state = 'pending';
drop table public.evidence_requests;
alter table public.sponsored_workers drop column work_role, drop column work_hours, drop column work_location;
drop table public.action_comments;
drop table public.weekly_actions;
drop function sponsor_guard_private.guard_action_management();
drop function public.weekly_action_roster(uuid);
drop view public.weekly_action_sources;
create or replace function public.consume_security_rate(operation text, network_key text, subject_key text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  config record;
  entry record;
  attempted integer;
  instant timestamptz := clock_timestamp();
begin
  select t.network_limit, t.subject_limit, t.window_seconds into config
  from (values
    ('auth_sign_in', 100, 10, 600),
    ('auth_sign_up', 40, 5, 900),
    ('auth_reset_request', 40, 5, 900),
    ('auth_confirm', 100, 15, 600),
    ('auth_mfa_enrol', 60, 8, 600),
    ('auth_mfa_verify', 100, 12, 600),
    ('auth_password_update', 40, 8, 600),
    ('passport_read', 180, 40, 60),
    ('passport_manage', 80, 20, 60),
    ('partner_invite_read', 100, 25, 60)
  ) t(name,network_limit,subject_limit,window_seconds) where t.name = operation;
  if not found or network_key is null or network_key !~ '^[0-9a-f]{64}$' or
    (subject_key is not null and subject_key !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid rate limit input.' using errcode = '22023';
  end if;

  for entry in
    select * from (values ('network',network_key,config.network_limit), ('subject',subject_key,config.subject_limit))
      as x(bucket,key_hash,budget) where x.key_hash is not null order by x.bucket
  loop
    insert into public.security_rate_buckets as b (scope,key_hash,window_until,attempts)
      values (operation || ':' || entry.bucket, entry.key_hash,
        instant + make_interval(secs => config.window_seconds), 1)
    on conflict (scope,key_hash) do update set
      attempts = case when b.window_until <= instant then 1 else least(b.attempts + 1, entry.budget + 1) end,
      window_until = case when b.window_until <= instant then excluded.window_until else b.window_until end
    returning attempts into attempted;
    -- Enforce the network budget first so it also bounds new subject rows.
    if attempted > entry.budget then return false; end if;
  end loop;
  return true;
end;
$$;

commit;
