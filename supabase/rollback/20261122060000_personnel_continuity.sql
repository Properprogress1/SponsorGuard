begin;
drop trigger personnel_handover_on_leaving on public.key_personnel;
drop function sponsor_guard_private.create_personnel_handover();
drop table public.personnel_handover_tasks;
drop table public.personnel_inactivity_rules;
alter table public.key_personnel
  drop constraint key_personnel_roles,
  drop constraint key_personnel_organisation_id_id_key,
  drop column leaving,
  drop column sms_last_login_on,
  drop column sms_mfa;
commit;
