create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  unsubscribe_id uuid not null unique default gen_random_uuid(),
  enabled boolean not null default false,
  tasks boolean not null default true,
  documents boolean not null default true,
  rtw boolean not null default true,
  personnel boolean not null default true
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public, anon, authenticated, service_role;
grant select (user_id, enabled, tasks, documents, rtw, personnel),
  insert (user_id, enabled, tasks, documents, rtw, personnel),
  update (user_id, enabled, tasks, documents, rtw, personnel) on public.notification_preferences to authenticated;
create policy notification_preferences_self on public.notification_preferences to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and user_id = (select auth.uid()))
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and user_id = (select auth.uid()));

create table public.notification_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  digest_day date not null,
  status text not null default 'claimed' check (status in ('claimed', 'accepted', 'uncertain')),
  unique (user_id, digest_day)
);
alter table public.notification_digest_deliveries enable row level security;
revoke all on public.notification_digest_deliveries from public, anon, authenticated, service_role;

create function public.claim_notification_digests(run_on date, batch_size integer)
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

create function public.finish_notification_digests(delivery_ids uuid[], accepted boolean)
returns void language sql security definer set search_path = ''
as $$
  update public.notification_digest_deliveries
  set status = case when accepted then 'accepted' else 'uncertain' end
  where id = any(delivery_ids) and status = 'claimed';
$$;

create function public.unsubscribe_notification_digests(opaque_id uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.notification_preferences set enabled = false where unsubscribe_id = opaque_id and enabled;
$$;

revoke all on function public.claim_notification_digests(date, integer),
  public.finish_notification_digests(uuid[], boolean), public.unsubscribe_notification_digests(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_digests(date, integer),
  public.finish_notification_digests(uuid[], boolean), public.unsubscribe_notification_digests(uuid) to service_role;
