create view public.weekly_action_sources with (security_invoker = true) as
  select t.organisation_id, 'reporting'::text as kind, t.reporting_event_id as record_id, e.due_on
  from public.tasks t join public.reporting_events e
    on (e.organisation_id,e.id) = (t.organisation_id,t.reporting_event_id)
  where not t.completed
  union all
  select d.organisation_id, 'document', d.id, d.expires_on
  from public.documents d where d.state = 'ready' and d.expires_on is not null
  union all
  select c.organisation_id, 'rtw', c.id, c.follow_up_on
  from public.rtw_checks c
  where c.follow_up_on is not null and not exists (
    select 1 from public.rtw_checks newer
    where newer.organisation_id = c.organisation_id
      and ((c.sponsored_worker_id is not null and newer.sponsored_worker_id = c.sponsored_worker_id)
        or (c.engaged_individual_id is not null and newer.engaged_individual_id = c.engaged_individual_id))
      and (newer.checked_on,newer.id) > (c.checked_on,c.id)
  );
revoke all on public.weekly_action_sources from public, anon, service_role;
grant select on public.weekly_action_sources to authenticated;

create table public.weekly_actions (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  kind text not null check (kind in ('reporting','document','rtw')),
  record_id uuid not null,
  assignee uuid,
  escalated boolean not null default false,
  handed_back boolean not null default false,
  reporting_id uuid generated always as (case when kind = 'reporting' then record_id end) stored,
  document_id uuid generated always as (case when kind = 'document' then record_id end) stored,
  rtw_id uuid generated always as (case when kind = 'rtw' then record_id end) stored,
  primary key (organisation_id,kind,record_id),
  foreign key (reporting_id) references public.reporting_events(id) on delete cascade,
  foreign key (document_id) references public.documents(id) on delete cascade,
  foreign key (rtw_id) references public.rtw_checks(id) on delete cascade,
  foreign key (organisation_id,assignee) references public.memberships(organisation_id,user_id) on delete set null (assignee)
);
create table public.action_comments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  kind text not null,
  record_id uuid not null,
  created_at timestamptz not null default now(),
  body text not null check (length(trim(body)) between 1 and 500),
  foreign key (organisation_id,kind,record_id)
    references public.weekly_actions(organisation_id,kind,record_id) on delete cascade
);
create index action_comments_thread on public.action_comments(organisation_id,kind,record_id,created_at desc);

do $$
declare item text;
begin
  foreach item in array array['weekly_actions','action_comments'] loop
    execute format('alter table public.%I enable row level security', item);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', item);
    execute format('grant select on public.%I to authenticated', item);
    execute format('create policy current_actions on public.%I for select to authenticated using (
      (select auth.jwt() ->> ''aal'') = ''aal2'' and sponsor_guard_private.has_plan(organisation_id,''core'')
      and exists (select from public.weekly_action_sources s
        where (s.organisation_id,s.kind,s.record_id) = (%I.organisation_id,%I.kind,%I.record_id)))',
      item,item,item,item);
    execute format('create policy write_actions on public.%I for insert to authenticated with check (
      (select auth.jwt() ->> ''aal'') = ''aal2'' and sponsor_guard_private.has_plan(organisation_id,''core'')
      and sponsor_guard_private.has_role(organisation_id,''owner'',''admin'',''hr_user'')
      and exists (select from public.weekly_action_sources s
        where (s.organisation_id,s.kind,s.record_id) = (%I.organisation_id,%I.kind,%I.record_id)))',
      item,item,item,item);
  end loop;
end;
$$;
grant insert (organisation_id,kind,record_id,assignee,escalated,handed_back),
  update (assignee,escalated,handed_back) on public.weekly_actions to authenticated;
grant insert (organisation_id,kind,record_id,body) on public.action_comments to authenticated;
create policy edit_actions on public.weekly_actions for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_plan(organisation_id,'core')
    and sponsor_guard_private.has_role(organisation_id,'owner','admin','hr_user')
    and exists (select from public.weekly_action_sources s
      where (s.organisation_id,s.kind,s.record_id) = (weekly_actions.organisation_id,weekly_actions.kind,weekly_actions.record_id)))
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_plan(organisation_id,'core')
    and sponsor_guard_private.has_role(organisation_id,'owner','admin','hr_user'));

alter table public.sponsored_workers
  add column work_role text check (length(trim(work_role)) between 1 and 120),
  add column work_hours numeric check (work_hours between 0 and 168 and scale(work_hours) <= 2),
  add column work_location text check (length(trim(work_location)) between 1 and 120);
grant update (work_role, work_hours, work_location) on public.sponsored_workers to authenticated;

create table public.evidence_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  worker_id uuid not null,
  document_type text not null check (document_type in ('right_to_work','identity','sponsorship','other')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  state text not null default 'open' check (state in ('open','uploading','submitted','approved','rejected','revoked')),
  document_id uuid,
  foreign key (organisation_id,worker_id)
    references public.sponsored_workers(organisation_id,id) on delete cascade
);
create index evidence_requests_workspace on public.evidence_requests(organisation_id,created_at desc);
alter table public.evidence_requests enable row level security;
revoke all on public.evidence_requests from public, anon, authenticated, service_role;
grant select (id,organisation_id,worker_id,document_type,expires_at,created_at,state,document_id),
  insert (organisation_id,worker_id,document_type,token_hash) on public.evidence_requests to authenticated;
create policy evidence_read on public.evidence_requests for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_plan(organisation_id,'pro')
    and sponsor_guard_private.has_direct_role(organisation_id,'owner','admin'));
create policy evidence_create on public.evidence_requests for insert to authenticated
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_plan(organisation_id,'pro')
    and sponsor_guard_private.has_direct_role(organisation_id,'owner','admin'));

create function public.reserve_evidence_upload(digest text, mime text, bytes integer)
returns table (tenant uuid, document uuid) language plpgsql security definer set search_path = ''
as $$
declare ticket public.evidence_requests%rowtype;
declare new_document uuid;
begin
  select * into ticket from public.evidence_requests r
  where r.token_hash = digest and r.state = 'open' and r.expires_at > now()
    and sponsor_guard_private.has_plan(r.organisation_id,'pro') for update;
  if not found then return; end if;
  insert into public.documents (organisation_id,sponsored_worker_id,document_type,content_type,size_bytes,scan_status)
    values (ticket.organisation_id,ticket.worker_id,ticket.document_type,mime,bytes,'not_scanned')
    returning id into new_document;
  update public.evidence_requests set state = 'uploading', document_id = new_document where id = ticket.id;
  return query select ticket.organisation_id,new_document;
end;
$$;

create function public.finish_evidence_upload(digest text, target uuid, stored boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare ticket public.evidence_requests%rowtype;
begin
  select * into ticket from public.evidence_requests
    where token_hash = digest and document_id = target and state = 'uploading' for update;
  if not found then return false; end if;
  if stored then
    if not exists (select from storage.objects where bucket_id = 'sponsorguard-documents'
      and name = ticket.organisation_id::text || '/' || target::text) then return false; end if;
    update public.documents set scan_status = 'clean'
      where id = target and organisation_id = ticket.organisation_id and state = 'pending';
    if not found then return false; end if;
    update public.evidence_requests set state = 'submitted' where id = ticket.id;
  else
    insert into public.privacy_storage_cleanup(organisation_id,bucket,path)
      values (ticket.organisation_id,'sponsorguard-documents',ticket.organisation_id::text || '/' || target::text)
      on conflict do nothing;
    delete from public.documents where id = target and state = 'pending';
    update public.evidence_requests set state = 'open', document_id = null where id = ticket.id;
  end if;
  return true;
end;
$$;

create function public.review_evidence_request(tenant uuid, request_id uuid, decision text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare ticket public.evidence_requests%rowtype;
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2'
    or not sponsor_guard_private.has_direct_role(tenant,'owner','admin')
    or not sponsor_guard_private.has_plan(tenant,'pro') then return false; end if;
  select * into ticket from public.evidence_requests where organisation_id = tenant and id = request_id for update;
  if not found then return false; end if;
  if decision = 'approved' and ticket.state = 'submitted' then
    update public.documents set state = 'ready'
      where organisation_id = tenant and id = ticket.document_id and state = 'pending' and scan_status = 'clean';
    if not found then return false; end if;
  elsif (decision = 'rejected' and ticket.state = 'submitted')
      or (decision = 'revoked' and ticket.state in ('open','uploading')) then
    if ticket.document_id is not null then
      insert into public.privacy_storage_cleanup(organisation_id,bucket,path)
        values (tenant,'sponsorguard-documents',tenant::text || '/' || ticket.document_id::text)
        on conflict do nothing;
      delete from public.documents where organisation_id = tenant and id = ticket.document_id and state = 'pending';
    end if;
  else
    return false;
  end if;
  update public.evidence_requests set state = decision where id = request_id;
  return true;
end;
$$;
revoke all on function public.reserve_evidence_upload(text,text,integer),
  public.finish_evidence_upload(text,uuid,boolean), public.review_evidence_request(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.reserve_evidence_upload(text,text,integer),
  public.finish_evidence_upload(text,uuid,boolean) to service_role;
grant execute on function public.review_evidence_request(uuid,uuid,text) to authenticated;

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
    ('evidence_upload', 30, 8, 900),
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


create function sponsor_guard_private.guard_action_management()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and (case when tg_op = 'INSERT' then new.assignee is not null or new.escalated
           else new.assignee is distinct from old.assignee or new.escalated is distinct from old.escalated end)
    and not sponsor_guard_private.has_role(new.organisation_id,'owner','admin') then
    raise exception 'Action assignment or escalation requires a manager.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function sponsor_guard_private.guard_action_management() from public,anon,authenticated,service_role;
create trigger action_management before insert or update on public.weekly_actions
  for each row execute function sponsor_guard_private.guard_action_management();

create function public.weekly_action_roster(tenant uuid)
returns table(user_id uuid, display_name text) language sql stable security definer set search_path = ''
as $$
  select m.user_id, coalesce(p.display_name, 'Team member · ' || right(m.user_id::text,8))
  from public.memberships m left join public.profiles p on p.id = m.user_id
  where m.organisation_id = tenant
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and sponsor_guard_private.has_direct_role(tenant,'owner','admin')
    and sponsor_guard_private.has_plan(tenant,'core')
  order by 2,1;
$$;
revoke all on function public.weekly_action_roster(uuid) from public,anon,authenticated,service_role;
grant execute on function public.weekly_action_roster(uuid) to authenticated;

create function public.recover_interrupted_evidence()
returns void language plpgsql security definer set search_path = ''
as $$
declare ticket public.evidence_requests%rowtype;
begin
  for ticket in
    select r.* from public.evidence_requests r join public.documents d on d.id = r.document_id
    where r.state = 'uploading' and d.state = 'pending' and d.created_at < now() - interval '30 minutes'
    order by d.created_at limit 100 for update of r skip locked
  loop
    perform public.finish_evidence_upload(ticket.token_hash,ticket.document_id,false);
  end loop;
end;
$$;
revoke all on function public.recover_interrupted_evidence() from public,anon,authenticated,service_role;
grant execute on function public.recover_interrupted_evidence() to service_role;

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
      from public.documents d where d.organisation_id = tenant and (d.state = 'ready' or exists (
        select from public.evidence_requests r where r.organisation_id = tenant and r.document_id = d.id
          and r.state = 'submitted' and d.scan_status = 'clean'
      )) and
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
