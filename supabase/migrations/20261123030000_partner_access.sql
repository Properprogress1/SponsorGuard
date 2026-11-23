create table public.partner_organisations (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  logo_data text check (
    logo_data is null or (length(logo_data) <= 175000 and logo_data ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$')
  ),
  primary_colour text not null default '#0f172a' check (primary_colour ~ '^#[0-9a-fA-F]{6}$'),
  accent_colour text not null default '#e2e8f0' check (accent_colour ~ '^#[0-9a-fA-F]{6}$')
);

create table public.partner_links (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_organisations(organisation_id) on delete cascade,
  client_id uuid not null references public.organisations(id) on delete cascade,
  role public.membership_role not null check (role in ('admin','hr_user','viewer')),
  consented_by uuid references auth.users(id) on delete set null,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (partner_id <> client_id)
);
create unique index active_partner_links_pair on public.partner_links(partner_id, client_id) where revoked_at is null;
create index active_partner_links_client on public.partner_links(client_id, partner_id) where revoked_at is null;

create table public.partner_invitations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_organisations(organisation_id) on delete cascade,
  recipient_hash bytea not null check (octet_length(recipient_hash) = 32),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  role public.membership_role not null check (role in ('admin','hr_user','viewer')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  cancelled_at timestamptz
);
create index partner_invitations_by_partner on public.partner_invitations(partner_id, created_at desc);

alter table public.partner_organisations enable row level security;
alter table public.partner_links enable row level security;
alter table public.partner_invitations enable row level security;
revoke all on public.partner_organisations, public.partner_links, public.partner_invitations from public, anon, authenticated, service_role;

create function sponsor_guard_private.direct_role(tenant uuid, actor uuid)
returns public.membership_role language sql stable security definer set search_path = ''
as $$
  select role from public.memberships where organisation_id = tenant and user_id = actor;
$$;

create function sponsor_guard_private.delegated_workspaces(actor uuid)
returns table (client_id uuid, partner_id uuid, role public.membership_role)
language sql stable security definer set search_path = ''
as $$
  select distinct on (l.client_id) l.client_id, l.partner_id,
    greatest(l.role, case when m.role = 'owner' then 'admin'::public.membership_role else m.role end) as role
  from public.partner_links l
  join public.memberships m on m.organisation_id = l.partner_id and m.user_id = actor
  where l.revoked_at is null and not exists (
    select 1 from public.memberships native where native.organisation_id = l.client_id and native.user_id = actor
  )
  -- The membership enum is ordered strongest to weakest.
  order by l.client_id, greatest(l.role, case when m.role = 'owner' then 'admin'::public.membership_role else m.role end),
    l.partner_id;
$$;
-- Existing RLS helpers remain the entry points for the records API. Native membership takes precedence.
create function sponsor_guard_private.workspace_role(tenant uuid, actor uuid)
returns public.membership_role language sql stable security definer set search_path = ''
as $$
  select coalesce(sponsor_guard_private.direct_role(tenant, actor),
    (select d.role from sponsor_guard_private.delegated_workspaces(actor) d where d.client_id = tenant));
$$;

create function sponsor_guard_private.has_direct_role(tenant uuid, variadic allowed_roles public.membership_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(sponsor_guard_private.direct_role(tenant, (select auth.uid())) = any(allowed_roles), false)
$$;
revoke all on function sponsor_guard_private.direct_role(uuid,uuid), sponsor_guard_private.delegated_workspaces(uuid),
  sponsor_guard_private.workspace_role(uuid,uuid), sponsor_guard_private.has_direct_role(uuid,public.membership_role[])
  from public, anon, authenticated, service_role;
grant execute on function sponsor_guard_private.has_direct_role(uuid,public.membership_role[]) to authenticated;

create or replace function sponsor_guard_private.is_member(target_organisation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select sponsor_guard_private.direct_role(target_organisation, (select auth.uid())) is not null
    or ((select auth.jwt() ->> 'aal') = 'aal2'
      and sponsor_guard_private.workspace_role(target_organisation, (select auth.uid())) is not null);
$$;

create or replace function sponsor_guard_private.has_role(target_organisation uuid, variadic allowed_roles public.membership_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((case when (select auth.jwt() ->> 'aal') = 'aal2'
    then sponsor_guard_private.workspace_role(target_organisation, (select auth.uid()))
    else sponsor_guard_private.direct_role(target_organisation, (select auth.uid()))
  end) = any (allowed_roles), false);
$$;

create or replace function sponsor_guard_private.can_manage_membership(target_organisation uuid, target_role public.membership_role)
returns boolean language sql stable set search_path = ''
as $$
  select case target_role
    when 'owner' then false
    when 'admin' then sponsor_guard_private.has_direct_role(target_organisation, 'owner')
    else sponsor_guard_private.has_direct_role(target_organisation, 'owner', 'admin')
  end;
$$;

alter policy organisations_update on public.organisations
  using (sponsor_guard_private.has_direct_role(id, 'owner', 'admin'))
  with check (sponsor_guard_private.has_direct_role(id, 'owner', 'admin'));
alter policy memberships_select on public.memberships
  using (sponsor_guard_private.has_direct_role(organisation_id, 'owner','admin','hr_user','viewer'));
alter policy passport_shares_managers on public.passport_shares
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_direct_role(organisation_id,'owner','admin'));
alter policy passport_access_managers on public.passport_share_access
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_direct_role(organisation_id,'owner','admin'));

create or replace function sponsor_guard_private.has_any_plan(minimum text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select m.organisation_id from public.memberships m where m.user_id = (select auth.uid())
      and sponsor_guard_private.has_plan(m.organisation_id, minimum)
    union all
    select d.client_id from sponsor_guard_private.delegated_workspaces((select auth.uid())) d
    where (select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_plan(d.client_id, minimum)
  );
$$;

grant select (organisation_id, primary_colour, accent_colour, logo_data) on public.partner_organisations to authenticated;
grant select (id, partner_id, client_id, role, consented_at, revoked_at) on public.partner_links to authenticated;
grant select (id, partner_id, role, created_at, expires_at, accepted_at, cancelled_at) on public.partner_invitations to authenticated;
create policy partner_brand_native_members on public.partner_organisations for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2'
    and sponsor_guard_private.has_direct_role(organisation_id,'owner','admin','hr_user','viewer'));
create policy partner_links_endpoints on public.partner_links for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2'
    and ((revoked_at is null and sponsor_guard_private.has_direct_role(partner_id,'owner','admin','hr_user','viewer'))
      or sponsor_guard_private.has_direct_role(client_id,'owner','admin')));
create policy partner_invites_managers on public.partner_invitations for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_direct_role(partner_id,'owner','admin'));

create function public.workspace_access()
returns table (organisation_id uuid, organisation_name text, role public.membership_role, via_partner uuid, partner_name text)
language sql stable security definer set search_path = ''
as $$
  select m.organisation_id, o.name, m.role, null::uuid, null::text
  from public.memberships m join public.organisations o on o.id = m.organisation_id
  where m.user_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2'
  union all
  select d.client_id, o.name, d.role, d.partner_id, p.name
  from sponsor_guard_private.delegated_workspaces((select auth.uid())) d
  join public.organisations o on o.id = d.client_id join public.organisations p on p.id = d.partner_id
  where (select auth.jwt() ->> 'aal') = 'aal2';
$$;

create function public.configure_partner(tenant uuid, primary_hex text, accent_hex text, logo text, clear_logo boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2'
      or not sponsor_guard_private.has_direct_role(tenant, 'owner') then
    raise exception 'Partner settings access denied.' using errcode = '42501';
  end if;
  if logo is not null and (length(logo) > 175000 or not (
    (logo like 'data:image/png;base64,%' and substring(decode(split_part(logo, ',', 2), 'base64') from 1 for 8) = decode('89504e470d0a1a0a','hex'))
    or (logo like 'data:image/jpeg;base64,%' and substring(decode(split_part(logo, ',', 2), 'base64') from 1 for 3) = decode('ffd8ff','hex'))
  )) then raise exception 'Invalid logo.' using errcode = '22023'; end if;
  insert into public.partner_organisations as p (organisation_id, primary_colour, accent_colour, logo_data)
    values (tenant, primary_hex, accent_hex, case when clear_logo then null else logo end)
    on conflict (organisation_id) do update set primary_colour = excluded.primary_colour,
      accent_colour = excluded.accent_colour, logo_data = case when clear_logo then null else coalesce(excluded.logo_data, p.logo_data) end;
end;
$$;

create function public.create_partner_invitation(tenant uuid, recipient text, token_digest text, access_role public.membership_role)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare invitation uuid;
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2'
      or not sponsor_guard_private.has_direct_role(tenant,'owner','admin')
      or not exists (select 1 from public.partner_organisations where organisation_id = tenant) then
    raise exception 'Invitation access denied.' using errcode = '42501';
  end if;
  if recipient is null or length(recipient) > 254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+$'
      or token_digest is null or token_digest !~ '^[0-9a-f]{64}$' or access_role is null or access_role = 'owner' then
    raise exception 'Invalid invitation.' using errcode = '22023';
  end if;
  insert into public.partner_invitations (partner_id, recipient_hash, token_hash, role)
    values (tenant, sha256(convert_to(lower(trim(recipient)), 'UTF8')), decode(token_digest,'hex'), access_role)
    returning id into invitation;
  return invitation;
end;
$$;

create function sponsor_guard_private.match_partner_invitation(token_digest text)
returns public.partner_invitations
language sql stable set search_path = ''
as $$
  select i from public.partner_invitations i join auth.users u on u.id = (select auth.uid())
  where (select auth.jwt() ->> 'aal') = 'aal2' and u.email_confirmed_at is not null
    and i.recipient_hash = sha256(convert_to(lower(trim(u.email)), 'UTF8'))
    and i.token_hash = case when token_digest ~ '^[0-9a-f]{64}$' then decode(token_digest,'hex') end
    and i.expires_at > clock_timestamp() and i.accepted_at is null and i.cancelled_at is null;
$$;
revoke all on function sponsor_guard_private.match_partner_invitation(text) from public, anon, authenticated, service_role;

create function public.inspect_partner_invitation(token_digest text)
returns table (partner_name text, role public.membership_role, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.name, i.role, i.expires_at
  from sponsor_guard_private.match_partner_invitation(token_digest) i
  join public.organisations o on o.id = i.partner_id;
$$;

create function public.accept_partner_invitation(tenant uuid, token_digest text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare invite public.partner_invitations%rowtype;
declare link_id uuid;
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2'
      or not sponsor_guard_private.has_direct_role(tenant,'owner') then
    raise exception 'Client owner consent required.' using errcode = '42501';
  end if;
  -- Lock before consuming. A cancellation or competing acceptance invalidates this request.
  perform id from public.partner_invitations
   where token_hash = case when token_digest ~ '^[0-9a-f]{64}$' then decode(token_digest,'hex') end for update;
  select i.* into invite from sponsor_guard_private.match_partner_invitation(token_digest) i;
  if invite.id is null or invite.partner_id = tenant then
    raise exception 'Invitation unavailable.' using errcode = '22023';
  end if;
  insert into public.partner_links(partner_id, client_id, role, consented_by)
    values (invite.partner_id, tenant, invite.role, (select auth.uid())) returning id into link_id;
  update public.partner_invitations set accepted_at = clock_timestamp() where id = invite.id;
  return link_id;
end;
$$;

create function public.cancel_partner_invitation(invitation uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  update public.partner_invitations i set cancelled_at = clock_timestamp()
  where i.id = invitation and i.accepted_at is null and i.cancelled_at is null
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and sponsor_guard_private.has_direct_role(i.partner_id,'owner','admin');
  return found;
end;
$$;

create function public.update_partner_link(link uuid, access_role public.membership_role default null)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if access_role = 'owner' then raise exception 'Invalid link role.' using errcode = '22023'; end if;
  update public.partner_links l
    set role = coalesce(access_role, l.role), revoked_at = case when access_role is null then clock_timestamp() end
  where l.id = link and l.revoked_at is null and (select auth.jwt() ->> 'aal') = 'aal2'
    and (sponsor_guard_private.has_direct_role(l.client_id,'owner')
      or (access_role is null and sponsor_guard_private.has_direct_role(l.partner_id,'owner','admin')));
  return found;
end;
$$;

create function public.list_partner_connections(tenant uuid)
returns table (id uuid, organisation_name text, direction text, role public.membership_role, revoked_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select l.id, o.name, case when l.partner_id = tenant then 'client' else 'partner' end, l.role, l.revoked_at
  from public.partner_links l join public.organisations o on o.id =
    case when l.partner_id = tenant then l.client_id else l.partner_id end
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and ((l.partner_id = tenant and l.revoked_at is null and sponsor_guard_private.has_direct_role(tenant,'owner','admin','hr_user','viewer'))
      or (l.client_id = tenant and sponsor_guard_private.has_direct_role(tenant,'owner','admin')))
  order by l.revoked_at nulls first, o.name, l.id;
$$;

revoke all on function public.workspace_access(), public.configure_partner(uuid,text,text,text,boolean),
  public.create_partner_invitation(uuid,text,text,public.membership_role),
  public.inspect_partner_invitation(text), public.accept_partner_invitation(uuid,text),
  public.cancel_partner_invitation(uuid), public.update_partner_link(uuid,public.membership_role),
  public.list_partner_connections(uuid) from public, anon, authenticated, service_role;
grant execute on function public.workspace_access(), public.configure_partner(uuid,text,text,text,boolean),
  public.create_partner_invitation(uuid,text,text,public.membership_role),
  public.inspect_partner_invitation(text), public.accept_partner_invitation(uuid,text),
  public.cancel_partner_invitation(uuid), public.update_partner_link(uuid,public.membership_role),
  public.list_partner_connections(uuid) to authenticated;

create or replace function public.revoke_passport_share(tenant uuid, share uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if (auth.jwt() ->> 'aal') is distinct from 'aal2'
    or not sponsor_guard_private.has_direct_role(tenant, 'owner', 'admin') then
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
    and (j.attempts >= 3 or not sponsor_guard_private.has_plan(j.organisation_id, case when j.requires_pro then 'pro' else 'core' end) or not coalesce(sponsor_guard_private.workspace_role(j.organisation_id, j.requested_by) in ('owner','admin'), false));
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
and coalesce(sponsor_guard_private.workspace_role(j.organisation_id, j.requested_by) in ('owner','admin'), false);
$$;

create or replace function public.finish_audit_pack(job uuid, lease uuid, generated timestamptz, problem text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  update public.audit_pack_jobs j set status = case when problem is null then 'ready' else 'failed' end,
    lease_until = null, generated_at = case when problem is null then generated end, failure = problem
  where j.id = job and j.attempt = lease and j.status = 'running' and j.lease_until > now()
  and (problem is not null or (generated is not null
    and sponsor_guard_private.has_plan(j.organisation_id, case when j.requires_pro then 'pro' else 'core' end) and coalesce(sponsor_guard_private.workspace_role(j.organisation_id, j.requested_by) in ('owner','admin'), false)));
  return found;
end;
$$;

create function public.workspace_partner_brand(tenant uuid)
returns table (primary_colour text, accent_colour text, logo_data text, partner_name text)
language sql stable security definer set search_path = ''
as $$
  select p.primary_colour, p.accent_colour, p.logo_data, o.name
  from public.partner_organisations p join public.organisations o on o.id = p.organisation_id
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and p.organisation_id = case
      when sponsor_guard_private.direct_role(tenant, (select auth.uid())) is not null then tenant
      else (select d.partner_id from sponsor_guard_private.delegated_workspaces((select auth.uid())) d where d.client_id = tenant)
    end;
$$;
revoke all on function public.workspace_partner_brand(uuid) from public, anon, authenticated, service_role;
grant execute on function public.workspace_partner_brand(uuid) to authenticated;
