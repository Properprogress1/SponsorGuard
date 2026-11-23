-- Restrictive policies also apply when clients call the database API directly.
create policy organisations_require_mfa on public.organisations as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');
create policy memberships_require_mfa on public.memberships as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');
create policy profiles_require_mfa on public.profiles as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');
create policy audit_log_require_mfa on public.audit_log as restrictive to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

create function public.onboard_organisation(organisation_name text, owner_display_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  organisation uuid;
begin
  if caller_id is null or (auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise exception 'Verified MFA is required' using errcode = '42501';
  end if;
  if coalesce(length(trim(organisation_name)), 0) not between 1 and 120
    or coalesce(length(trim(owner_display_name)), 0) not between 1 and 120 then
    raise exception 'Enter names between 1 and 120 characters' using errcode = '22023';
  end if;

  -- Serialize initial provisioning for this user, including double submits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller_id::text, 0));
  select organisation_id into organisation
  from public.memberships where user_id = caller_id order by organisation_id limit 1;
  if found then
    return organisation;
  end if;

  insert into public.profiles (id, display_name)
  values (caller_id, trim(owner_display_name))
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.organisations (name) values (trim(organisation_name)) returning id into organisation;
  insert into public.memberships (organisation_id, user_id, role) values (organisation, caller_id, 'owner');
  insert into public.audit_log (organisation_id, event) values (organisation, 'organisation_created');

  return organisation;
end;
$$;

revoke all on function public.onboard_organisation(text, text) from public, anon, authenticated, service_role;
grant execute on function public.onboard_organisation(text, text) to authenticated;
