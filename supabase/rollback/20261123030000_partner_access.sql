begin;
create or replace function sponsor_guard_private.is_member(target_organisation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organisation_id = target_organisation and user_id = (select auth.uid())
  );
$$;

create or replace function sponsor_guard_private.has_role(
  target_organisation uuid, variadic allowed_roles public.membership_role[]
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organisation_id = target_organisation
      and user_id = (select auth.uid())
      and role = any (allowed_roles)
  );
$$;

create or replace function sponsor_guard_private.can_manage_membership(
  target_organisation uuid, target_role public.membership_role
)
returns boolean language sql stable set search_path = ''
as $$
  select case target_role
    when 'owner' then false
    when 'admin' then sponsor_guard_private.has_role(target_organisation, 'owner')
    else sponsor_guard_private.has_role(target_organisation, 'owner', 'admin')
  end;
$$;

create or replace function sponsor_guard_private.has_any_plan(minimum text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.user_id = (select auth.uid())
    and sponsor_guard_private.has_plan(m.organisation_id, minimum));
$$;

create or replace function public.revoke_passport_share(tenant uuid, share uuid)
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

create or replace function public.claim_audit_pack()
returns table (id uuid, organisation_id uuid, attempt uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  update public.audit_pack_jobs j set status = 'failed', lease_until = null,
    failure = case when j.attempts >= 3 then 'generation_failed' else 'access_changed' end
  where (j.status = 'queued' or (j.status = 'running' and j.lease_until <= now()))
    and (j.attempts >= 3 or not sponsor_guard_private.has_plan(j.organisation_id, case when j.requires_pro then 'pro' else 'core' end) or not exists (
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
    where i.organisation_id = o.id and j.requires_pro
  ) p),
 'checks', (select coalesce(jsonb_agg(c order by c.checked_on, c.id), '[]') from (
    select r.id, coalesce(w.reference, p.reference) as person_reference,
      case when r.sponsored_worker_id is not null then 'Sponsored worker' else 'Engaged individual' end as person_type,
      r.checked_on, r.method, r.follow_up_on from public.rtw_checks r
    left join public.sponsored_workers w on (w.organisation_id, w.id) = (r.organisation_id, r.sponsored_worker_id)
    left join public.engaged_individuals p on (p.organisation_id, p.id) = (r.organisation_id, r.engaged_individual_id)
    where r.organisation_id = o.id and (r.engaged_individual_id is null or j.requires_pro)
  ) c),
 'reporting', (select coalesce(jsonb_agg(e order by e.event_on, e.id), '[]') from (
    select e.id, e.event_on, e.due_on, r.description, r.version, t.completed
    from public.reporting_events e join public.reporting_rules r on e.reporting_rule_id = r.id
    left join public.tasks t on (t.organisation_id, t.reporting_event_id) = (e.organisation_id, e.id)
    where e.organisation_id = o.id
  ) e),
 'personnel', (select coalesce(jsonb_agg(p order by p.role, p.full_name), '[]') from (
    select role, full_name, sms_mfa, sms_last_login_on, leaving from public.key_personnel where organisation_id = o.id and j.requires_pro
  ) p),
 'documents', (select coalesce(jsonb_agg(d order by d.id), '[]') from (
    select d.id, d.document_type, d.issued_on, d.expires_on, d.content_type, d.size_bytes,
      coalesce(w.reference, p.reference) as person_reference,
      case when d.sponsored_worker_id is not null then 'Sponsored worker' else 'Engaged individual' end as person_type
    from public.documents d
    left join public.sponsored_workers w on (w.organisation_id, w.id) = (d.organisation_id, d.sponsored_worker_id)
    left join public.engaged_individuals p on (p.organisation_id, p.id) = (d.organisation_id, d.engaged_individual_id)
    where d.organisation_id = o.id and d.state = 'ready' and (d.engaged_individual_id is null or j.requires_pro)
  ) d),
 'ledger', (select to_jsonb(v) from sponsor_guard_private.check_audit_ledger(o.id) v)
)
from public.audit_pack_jobs j join public.organisations o on o.id = j.organisation_id
where j.id = job and j.attempt = lease and j.status = 'running' and j.lease_until > now()
and sponsor_guard_private.has_plan(j.organisation_id, case when j.requires_pro then 'pro' else 'core' end)
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
  and (problem is not null or (generated is not null
    and sponsor_guard_private.has_plan(j.organisation_id, case when j.requires_pro then 'pro' else 'core' end) and exists (
    select 1 from public.memberships m where m.organisation_id = j.organisation_id
      and m.user_id = j.requested_by and m.role in ('owner', 'admin')
  )));
  return found;
end;
$$;
alter policy organisations_update on public.organisations
  using (sponsor_guard_private.has_role(id, 'owner', 'admin'))
  with check (sponsor_guard_private.has_role(id, 'owner', 'admin'));
alter policy memberships_select on public.memberships
  using (sponsor_guard_private.is_member(organisation_id));
alter policy passport_shares_managers on public.passport_shares
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id,'owner','admin'));
alter policy passport_access_managers on public.passport_share_access
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id,'owner','admin'));

drop function public.workspace_partner_brand(uuid);
drop function public.list_partner_connections(uuid);
drop function public.update_partner_link(uuid,public.membership_role);
drop function public.cancel_partner_invitation(uuid);
drop function public.accept_partner_invitation(uuid,text);
drop function public.inspect_partner_invitation(text);
drop function sponsor_guard_private.match_partner_invitation(text);
drop function public.create_partner_invitation(uuid,text,text,public.membership_role);
drop function public.configure_partner(uuid,text,text,text,boolean);
drop function public.workspace_access();
drop table public.partner_invitations, public.partner_links, public.partner_organisations;
drop function sponsor_guard_private.has_direct_role(uuid,public.membership_role[]);
drop function sponsor_guard_private.workspace_role(uuid,uuid);
drop function sponsor_guard_private.delegated_workspaces(uuid);
drop function sponsor_guard_private.direct_role(uuid,uuid);
commit;
