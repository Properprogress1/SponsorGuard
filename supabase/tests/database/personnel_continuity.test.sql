begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
set local search_path = public, extensions;
select plan(12);

insert into auth.users (id) values ('00000000-0000-4000-8000-000000008101'), ('00000000-0000-4000-8000-000000008102');
insert into organisations (id, name) values ('00000000-0000-4000-8000-000000008001', 'Synthetic Tenant A'),
  ('00000000-0000-4000-8000-000000008002', 'Synthetic Tenant B');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008002');
insert into memberships (organisation_id, user_id, role) values
  ('00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008101', 'owner'),
  ('00000000-0000-4000-8000-000000008002', '00000000-0000-4000-8000-000000008102', 'admin');
insert into key_personnel (id, organisation_id, full_name, role) values
  ('00000000-0000-4000-8000-000000008201', '00000000-0000-4000-8000-000000008001', 'Synthetic Person', 'Key Contact');

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000008101';
select is((select count(*) from personnel_handover_tasks), 0::bigint, 'Ordinary records do not create tasks');
select lives_ok($$update key_personnel set leaving = true, sms_mfa = 'enabled', sms_last_login_on = date '2026-01-01'$$, 'Owner can record self-reported details and departure');
select results_eq($$select step from personnel_handover_tasks order by step$$,
  $$values ('confirm_replacement'), ('review_sms_access'), ('transfer_responsibilities')$$, 'Departure creates the checklist');
select lives_ok($$update personnel_handover_tasks set completed = true where step = 'confirm_replacement'$$, 'Owner can complete a task');
update key_personnel set leaving = true;
update key_personnel set leaving = false;
update key_personnel set leaving = true;
select is((select count(*) from personnel_handover_tasks), 3::bigint, 'Repeated departures do not duplicate the checklist');
select ok((select completed from personnel_handover_tasks where step = 'confirm_replacement'), 'Existing checklist progress is preserved');
insert into key_personnel (organisation_id, full_name, role, leaving)
values ('00000000-0000-4000-8000-000000008001', 'Synthetic New Person', 'Level 1 user', true);
select is((select count(*) from personnel_handover_tasks), 6::bigint, 'Adding a person already leaving also creates a checklist');
select throws_ok($$insert into personnel_handover_tasks (organisation_id, personnel_id, step)
  values ('00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008201', 'review_sms_access')$$,
  '42501', null, 'Clients cannot manufacture checklist tasks');
select throws_ok($$update key_personnel set role = 'Invalid role'$$, '23514', null, 'New writes are limited to supported roles');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000008102';
select is((select count(*) from personnel_handover_tasks), 0::bigint, 'Another tenant manager cannot access the checklist');
with modified as (update personnel_handover_tasks set completed = false returning *)
select is((select count(*) from modified),
  0::bigint, 'Another tenant manager cannot change tasks');
set local request.jwt.claims = '{"aal":"aal1"}';
select is((select count(*) from personnel_inactivity_rules), 0::bigint, 'Configuration requires an MFA-verified session');
reset role;
select * from finish();
rollback;
