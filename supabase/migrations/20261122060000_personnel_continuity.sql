alter table public.key_personnel
  add column sms_mfa text not null default 'unknown'
    check (sms_mfa in ('unknown', 'enabled', 'disabled')),
  add column sms_last_login_on date
    check (sms_last_login_on is null or isfinite(sms_last_login_on)),
  add column leaving boolean not null default false,
  add constraint key_personnel_roles check (role in ('Authorising Officer', 'Key Contact', 'Level 1 user')) not valid,
  add unique (organisation_id, id);

grant insert (sms_mfa, sms_last_login_on, leaving), update (sms_mfa, sms_last_login_on, leaving)
  on public.key_personnel to authenticated;

create table public.personnel_inactivity_rules (
  effective_from date primary key check (isfinite(effective_from)),
  inactivity_days integer not null check (inactivity_days > 0),
  source_reference text not null check (length(trim(source_reference)) > 0)
);
alter table public.personnel_inactivity_rules enable row level security;
revoke all on public.personnel_inactivity_rules from public, anon, authenticated, service_role;
grant select on public.personnel_inactivity_rules to authenticated;
create policy personnel_inactivity_rules_verified on public.personnel_inactivity_rules for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');
create trigger personnel_inactivity_rules_append_only before update or delete or truncate on public.personnel_inactivity_rules
  for each statement execute function sponsor_guard_private.guard_reporting_rule_history();

insert into public.personnel_inactivity_rules values (
  '2026-01-01', 90, 'SponsorGuard internal reminder default. VERIFY against current Home Office guidance.'
);

create table public.personnel_handover_tasks (
  organisation_id uuid not null,
  personnel_id uuid not null,
  step text not null check (step in ('confirm_replacement', 'transfer_responsibilities', 'review_sms_access')),
  completed boolean not null default false,
  primary key (organisation_id, personnel_id, step),
  foreign key (organisation_id, personnel_id) references public.key_personnel (organisation_id, id) on delete restrict
);
alter table public.personnel_handover_tasks enable row level security;
revoke all on public.personnel_handover_tasks from public, anon, authenticated, service_role;
grant select, update (completed) on public.personnel_handover_tasks to authenticated;
create policy personnel_handover_managers on public.personnel_handover_tasks to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'))
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'));

create function sponsor_guard_private.create_personnel_handover()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.leaving then return null; end if;
  insert into public.personnel_handover_tasks (organisation_id, personnel_id, step)
    values (new.organisation_id, new.id, 'confirm_replacement'),
      (new.organisation_id, new.id, 'transfer_responsibilities'),
      (new.organisation_id, new.id, 'review_sms_access')
    on conflict (organisation_id, personnel_id, step) do nothing;
  return null;
end;
$$;
revoke all on function sponsor_guard_private.create_personnel_handover() from public, anon, authenticated, service_role;
create trigger personnel_handover_on_leaving after insert or update of leaving on public.key_personnel
  for each row when (new.leaving) execute function sponsor_guard_private.create_personnel_handover();
