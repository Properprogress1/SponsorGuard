begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
set local search_path = public, extensions;
select plan(16);
insert into auth.users (id) values ('00000000-0000-4000-8000-000000009101'), ('00000000-0000-4000-8000-000000009102');
insert into organisations (id, name) values ('00000000-0000-4000-8000-000000009001', 'Map A'), ('00000000-0000-4000-8000-000000009002', 'Map B');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000009002');
insert into memberships (organisation_id, user_id, role) values
 ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000009101', 'owner'),
 ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000009102', 'viewer');
insert into engagement_categories (organisation_id, key, label) values
 ('00000000-0000-4000-8000-000000009002', 'foreign-only', 'Foreign category');
insert into engaged_individuals (id, organisation_id, full_name, reference, engagement_type) values
 ('00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009001', 'Checked', 'A', 'employee'),
 ('00000000-0000-4000-8000-000000009202', '00000000-0000-4000-8000-000000009001', 'No check', 'B', 'contractor'),
 ('00000000-0000-4000-8000-000000009203', '00000000-0000-4000-8000-000000009002', 'Foreign', 'C', 'foreign-only'),
 ('00000000-0000-4000-8000-000000009204', '00000000-0000-4000-8000-000000009001', 'Scheduled', 'D', 'agency'),
 ('00000000-0000-4000-8000-000000009205', '00000000-0000-4000-8000-000000009001', 'Recorded', 'E', 'agency');
insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, follow_up_on, method)
select '00000000-0000-4000-8000-000000009001', person::uuid, (now() at time zone 'Europe/London')::date + checked,
  (now() at time zone 'Europe/London')::date + follow_up, 'manual'
from (values
 ('00000000-0000-4000-8000-000000009201', -6, 3),
 ('00000000-0000-4000-8000-000000009201', -3, 0),
 ('00000000-0000-4000-8000-000000009204', -1, 2),
 ('00000000-0000-4000-8000-000000009205', -1, null)
) x(person, checked, follow_up);

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000009101';
select is((select count(*) from engagement_categories), 5::bigint, 'New tenant receives five defaults and does not see foreign categories');
select is((select count(*) from workforce_map), 4::bigint, 'View applies RLS for the requesting tenant');
select results_eq($$select reference, check_status from workforce_map order by reference$$,
 $$values ('A', 'due'), ('B', 'missing'), ('D', 'scheduled'), ('E', 'recorded')$$, 'Latest check controls status and today counts as due');
select is((select follow_up_on from workforce_map where reference = 'A'), (now() at time zone 'Europe/London')::date, 'Latest follow-up date is retained');
select lives_ok($$insert into engagement_categories values ('00000000-0000-4000-8000-000000009001', 'custom-type', 'Custom type')$$, 'Owner can add a category');
select lives_ok($$update engaged_individuals set engagement_type = 'custom-type', check_responsibility = 'Operations' where reference = 'A'$$, 'Owner can assign a category and responsibility');
select lives_ok($$update engagement_categories set label = 'Renamed type' where key = 'custom-type'$$, 'Owner can rename a category');
select results_eq($$select engagement_label, check_responsibility from workforce_map where reference = 'A'$$,
 $$values ('Renamed type', 'Operations')$$, 'View uses configured label and recorded responsibility');
select throws_ok($$update engaged_individuals set engagement_type = 'foreign-only' where reference = 'A'$$, '23503', null, 'Foreign category cannot be assigned');
select throws_ok($$insert into engagement_categories values ('00000000-0000-4000-8000-000000009002', 'intrusion', 'Rejected')$$,
 '42501', null, 'Owner cannot add a category to another tenant');
with changed as (update engagement_categories set label = 'Rejected' where key = 'foreign-only' returning key)
select is((select count(*) from changed), 0::bigint, 'Owner cannot rename a foreign category');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000009102';
select is((select count(*) from workforce_map), 4::bigint, 'A verified viewer can read their tenant map');
select throws_ok($$insert into engagement_categories values ('00000000-0000-4000-8000-000000009001', 'other', 'Rejected')$$,
 '42501', null, 'Viewer cannot configure categories');
with changed as (update engaged_individuals set check_responsibility = 'Rejected' returning id)
select is((select count(*) from changed), 0::bigint, 'Viewer cannot update check responsibility');
set local request.jwt.claims = '{"aal":"aal1"}';
select is((select count(*) from workforce_map), 0::bigint, 'View requires verified MFA');
set local role anon;
select throws_ok($$select * from workforce_map$$, '42501', null, 'Anonymous callers cannot read the view');
reset role;
select * from finish();
rollback;
