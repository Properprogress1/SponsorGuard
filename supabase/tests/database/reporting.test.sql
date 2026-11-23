begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
set local search_path = public, extensions;
select plan(37);

insert into reporting_rules
  (key, description, working_day_limit, source_reference, effective_from, version)
values ('test_clock', 'Synthetic reporting clock', 2, 'Synthetic rule fixture', '2026-01-01', 1);

select is((select due_on from compute_reporting_due_date('test_clock', '2026-07-10')),
  date '2026-07-14', 'A Friday event skips the weekend and excludes the event date');
select is((select due_on from compute_reporting_due_date('test_clock', '2026-07-11')),
  date '2026-07-14', 'A weekend event starts counting on the next working day');
select is((select due_on from compute_reporting_due_date('test_clock', '2026-04-02')),
  date '2026-04-08', 'Good Friday and Easter Monday are excluded');
select is((select due_on from compute_reporting_due_date('test_clock', '2026-12-24')),
  date '2026-12-30', 'Christmas and observed Boxing Day are excluded');
select is((select due_on from compute_reporting_due_date('test_clock', '2026-12-31')),
  date '2027-01-05', 'Crosses into a new year and excludes New Year’s Day');
select throws_ok($$select * from compute_reporting_due_date('test_clock', '2028-12-29')$$,
  'P2002', null, 'Missing coverage in the deadline year stops computation');
select throws_ok($$select * from compute_reporting_due_date('test_clock', '2029-01-05')$$,
  'P2002', null, 'Missing coverage in the event year stops computation');
select throws_ok($$select * from compute_reporting_due_date('test_clock', '2025-01-01')$$,
  'P2001', null, 'A date before the first version has no effective rule');
select throws_ok($$select * from compute_reporting_due_date('missing_rule', '2026-01-01')$$,
  'P2001', null, 'An unknown rule fails explicitly');
select throws_ok($$select * from compute_reporting_due_date('test_clock', null)$$,
  '22023', null, 'An event date is required');
select ok((select bool_and(requires_verification) from reporting_rules where key in ('worker_circumstances', 'organisation_change')),
  'Both seeded rules are marked VERIFY');

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000004101'), ('00000000-0000-4000-8000-000000004102'),
  ('00000000-0000-4000-8000-000000004103'), ('00000000-0000-4000-8000-000000004104');
insert into organisations (id, name) values
  ('00000000-0000-4000-8000-000000004001', 'Reporting A'), ('00000000-0000-4000-8000-000000004002', 'Reporting B');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000004001', '00000000-0000-4000-8000-000000004002');
insert into memberships values
  ('00000000-0000-4000-8000-000000004001', '00000000-0000-4000-8000-000000004101', 'owner'),
  ('00000000-0000-4000-8000-000000004001', '00000000-0000-4000-8000-000000004102', 'viewer'),
  ('00000000-0000-4000-8000-000000004001', '00000000-0000-4000-8000-000000004103', 'hr_user'),
  ('00000000-0000-4000-8000-000000004001', '00000000-0000-4000-8000-000000004104', 'admin');
insert into reporting_events (organisation_id, rule_key, event_on)
values ('00000000-0000-4000-8000-000000004002', 'test_clock', '2026-07-10');

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000004101';
select lives_ok($$insert into reporting_events (organisation_id, rule_key, event_on)
  values ('00000000-0000-4000-8000-000000004001', 'test_clock', '2026-07-10')$$,
  'Owner can record a reporting event');
select is((select count(*) from tasks), 1::bigint, 'Recording an event creates exactly one visible task');
select is((select count(*) from reporting_events), 1::bigint, 'Owner cannot see another organisation’s events');
select is((select count(*) from tasks where organisation_id = '00000000-0000-4000-8000-000000004002'), 0::bigint,
  'Owner cannot see another organisation’s tasks');
select is((select due_on from reporting_events), date '2026-07-14', 'Recorded event pins the computed deadline');
select throws_ok($$insert into reporting_events (organisation_id, rule_key, event_on)
  values ('00000000-0000-4000-8000-000000004002', 'test_clock', '2026-07-09')$$, '42501', null,
  'Owner cannot create an event for another organisation');
select throws_ok($$insert into reporting_events (organisation_id, rule_key, event_on)
  values ('00000000-0000-4000-8000-000000004001', 'missing_rule', '2026-07-09')$$, 'P2001', null,
  'Invalid clock prevents event creation');
select is((select count(*) from tasks), 1::bigint, 'A rejected event creates no task');
select throws_ok($$insert into tasks (organisation_id, reporting_event_id)
  select organisation_id, id from reporting_events$$, '42501', null, 'Clients cannot create tasks directly');
select throws_ok($$update reporting_events set due_on = '2026-07-20'$$, '42501', null,
  'Clients cannot rewrite computed dates');
with updated as (update tasks set completed = true where organisation_id = '00000000-0000-4000-8000-000000004002' returning id)
select is((select count(*) from updated), 0::bigint, 'Owner cannot complete a foreign task');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000004102';
select is((select count(*) from tasks), 1::bigint, 'Viewer can see their own tasks');
select throws_ok($$insert into reporting_events (organisation_id, rule_key, event_on)
  values ('00000000-0000-4000-8000-000000004001', 'test_clock', '2026-07-08')$$, '42501', null,
  'Viewer cannot record an event');
with updated as (update tasks set completed = true returning id)
select is((select count(*) from updated), 0::bigint, 'Viewer cannot complete a task');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000004103';
select lives_ok($$update tasks set completed = true$$, 'HR user can complete an organisation task');
select is((select completed from tasks), true, 'Completion is persisted');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000004104';
select lives_ok($$insert into reporting_events (organisation_id, rule_key, event_on)
  values ('00000000-0000-4000-8000-000000004001', 'test_clock', '2026-07-08')$$,
  'Admin can record an event');

set local request.jwt.claims = '{"aal":"aal1"}';
select is((select count(*) from reporting_events) + (select count(*) from tasks)
  + (select count(*) from reporting_rules) + (select count(*) from bank_holidays)
  + (select count(*) from bank_holiday_years), 0::bigint, 'AAL1 cannot read reporting tables');

reset role;
insert into reporting_rules
  (key, description, working_day_limit, source_reference, effective_from, effective_to, version)
values ('test_clock', 'Synthetic reporting clock v2', 3, 'Synthetic rule fixture', '2026-07-10', '2026-08-01', 2);
select is((select due_on from compute_reporting_due_date('test_clock', '2026-07-09')),
  date '2026-07-13', 'An event before the new boundary uses the old version even if due later');
select is((select due_on from compute_reporting_due_date('test_clock', '2026-07-10')),
  date '2026-07-15', 'An event on the effective start uses the new version');
select is((select due_on from reporting_events where event_on = '2026-07-10' and organisation_id = '00000000-0000-4000-8000-000000004001'),
  date '2026-07-14', 'An existing event keeps its deadline after a rule change');
select is((select rule.version from reporting_events event join reporting_rules rule on rule.id = event.reporting_rule_id
  where event.event_on = '2026-07-10' and event.organisation_id = '00000000-0000-4000-8000-000000004001'),
  1, 'An existing event keeps the exact rule version');
select throws_ok($$select * from compute_reporting_due_date('test_clock', '2026-08-01')$$,
  'P2001', null, 'The end is exclusive and an old open version stays superseded');

insert into reporting_rules
  (key, description, working_day_limit, source_reference, effective_from, version)
values ('test_clock', 'Synthetic same-day correction', 1, 'Synthetic rule fixture', '2026-07-10', 3);
select is((select due_on from compute_reporting_due_date('test_clock', '2026-07-10')),
  date '2026-07-13', 'The highest version wins when the effective start matches');
select throws_ok($$update reporting_rules set working_day_limit = 99 where key = 'test_clock'$$,
  '55000', null, 'Existing rules cannot be overwritten');
select throws_ok($$delete from reporting_rules where key = 'test_clock'$$,
  '55000', null, 'Existing rules cannot be deleted');

select * from finish();
rollback;
