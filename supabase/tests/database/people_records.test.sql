begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
set local search_path = public, extensions;
select plan(107);

insert into auth.users (id) values ('00000000-0000-4000-8000-000000002001'), ('00000000-0000-4000-8000-000000002002'), ('00000000-0000-4000-8000-000000002003'), ('00000000-0000-4000-8000-000000002004');
insert into organisations (id, name) values ('00000000-0000-4000-8000-000000002001', 'People Test A'), ('00000000-0000-4000-8000-000000002002', 'People Test B');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002002');
insert into memberships values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002001', 'owner'), ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002002', 'admin'),
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002003', 'hr_user'), ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002004', 'viewer');
insert into sponsored_workers (id, organisation_id, full_name, reference, status) values
  ('00000000-0000-4000-8000-000000002101', '00000000-0000-4000-8000-000000002001', 'Worker A', 'WA', 'active'),
  ('00000000-0000-4000-8000-000000002201', '00000000-0000-4000-8000-000000002002', 'Worker B', 'WB', 'active');
insert into engaged_individuals (id, organisation_id, full_name, reference, engagement_type) values
  ('00000000-0000-4000-8000-000000002102', '00000000-0000-4000-8000-000000002001', 'Person A', 'EA', 'employee'),
  ('00000000-0000-4000-8000-000000002202', '00000000-0000-4000-8000-000000002002', 'Person B', 'EB', 'platform');
insert into cos_records (id, organisation_id, sponsored_worker_id, reference, assigned_on, status) values
  ('00000000-0000-4000-8000-000000002103', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002101', 'CA', '2026-10-01', 'assigned'),
  ('00000000-0000-4000-8000-000000002203', '00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002201', 'CB', '2026-10-01', 'assigned');
insert into rtw_checks (id, organisation_id, engaged_individual_id, checked_on, method) values
  ('00000000-0000-4000-8000-000000002104', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002102', '2026-10-01', 'online'),
  ('00000000-0000-4000-8000-000000002204', '00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002202', '2026-10-01', 'online');

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002001';
select is((select count(*) from sponsored_workers where id = '00000000-0000-4000-8000-000000002101'), 1::bigint, 'owner reads own sponsored_workers');
select is((select count(*) from sponsored_workers where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'owner cannot read foreign sponsored_workers');
select throws_ok($$insert into sponsored_workers (organisation_id, full_name, reference, status) values ('00000000-0000-4000-8000-000000002002', 'New Worker', 'CROSS-0-W', 'inactive')$$,
  '42501', null, 'owner cannot insert foreign sponsored_workers');
with changed as (update sponsored_workers set status = 'inactive' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'owner cannot update foreign sponsored_workers');
select lives_ok($$insert into sponsored_workers (organisation_id, full_name, reference, status) values ('00000000-0000-4000-8000-000000002001', 'New Worker', 'NEW-0-W', 'inactive')$$,
  'owner can insert own sponsored_workers');
with changed as (update sponsored_workers set status = 'inactive' where id = '00000000-0000-4000-8000-000000002101' returning id)
select is((select count(*) from changed), 1::bigint, 'owner can update own sponsored_workers');
select is((select count(*) from engaged_individuals where id = '00000000-0000-4000-8000-000000002102'), 1::bigint, 'owner reads own engaged_individuals');
select is((select count(*) from engaged_individuals where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'owner cannot read foreign engaged_individuals');
select throws_ok($$insert into engaged_individuals (organisation_id, full_name, reference, engagement_type) values ('00000000-0000-4000-8000-000000002002', 'New Person', 'CROSS-0-E', 'agency')$$,
  '42501', null, 'owner cannot insert foreign engaged_individuals');
with changed as (update engaged_individuals set engagement_type = 'contractor' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'owner cannot update foreign engaged_individuals');
select lives_ok($$insert into engaged_individuals (organisation_id, full_name, reference, engagement_type) values ('00000000-0000-4000-8000-000000002001', 'New Person', 'NEW-0-E', 'agency')$$,
  'owner can insert own engaged_individuals');
with changed as (update engaged_individuals set engagement_type = 'contractor' where id = '00000000-0000-4000-8000-000000002102' returning id)
select is((select count(*) from changed), 1::bigint, 'owner can update own engaged_individuals');
select is((select count(*) from cos_records where id = '00000000-0000-4000-8000-000000002103'), 1::bigint, 'owner reads own cos_records');
select is((select count(*) from cos_records where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'owner cannot read foreign cos_records');
select throws_ok($$insert into cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status) values ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002201', 'CROSS-0-C', '2026-10-01', 'used')$$,
  '42501', null, 'owner cannot insert foreign cos_records');
with changed as (update cos_records set status = 'used' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'owner cannot update foreign cos_records');
select lives_ok($$insert into cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status) values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002101', 'NEW-0-C', '2026-10-01', 'used')$$,
  'owner can insert own cos_records');
with changed as (update cos_records set status = 'used' where id = '00000000-0000-4000-8000-000000002103' returning id)
select is((select count(*) from changed), 1::bigint, 'owner can update own cos_records');
select is((select count(*) from rtw_checks where id = '00000000-0000-4000-8000-000000002104'), 1::bigint, 'owner reads own rtw_checks');
select is((select count(*) from rtw_checks where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'owner cannot read foreign rtw_checks');
select throws_ok($$insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, method) values ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002202', '2026-10-01', 'manual')$$,
  '42501', null, 'owner cannot insert foreign rtw_checks');
with changed as (update rtw_checks set method = 'manual' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'owner cannot update foreign rtw_checks');
select lives_ok($$insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, method) values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002102', '2026-10-01', 'manual')$$,
  'owner can insert own rtw_checks');
with changed as (update rtw_checks set method = 'manual' where id = '00000000-0000-4000-8000-000000002104' returning id)
select is((select count(*) from changed), 1::bigint, 'owner can update own rtw_checks');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002002';
select is((select count(*) from sponsored_workers where id = '00000000-0000-4000-8000-000000002101'), 1::bigint, 'admin reads own sponsored_workers');
select is((select count(*) from sponsored_workers where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'admin cannot read foreign sponsored_workers');
select throws_ok($$insert into sponsored_workers (organisation_id, full_name, reference, status) values ('00000000-0000-4000-8000-000000002002', 'New Worker', 'CROSS-1-W', 'inactive')$$,
  '42501', null, 'admin cannot insert foreign sponsored_workers');
with changed as (update sponsored_workers set status = 'inactive' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'admin cannot update foreign sponsored_workers');
select lives_ok($$insert into sponsored_workers (organisation_id, full_name, reference, status) values ('00000000-0000-4000-8000-000000002001', 'New Worker', 'NEW-1-W', 'inactive')$$,
  'admin can insert own sponsored_workers');
with changed as (update sponsored_workers set status = 'inactive' where id = '00000000-0000-4000-8000-000000002101' returning id)
select is((select count(*) from changed), 1::bigint, 'admin can update own sponsored_workers');
select is((select count(*) from engaged_individuals where id = '00000000-0000-4000-8000-000000002102'), 1::bigint, 'admin reads own engaged_individuals');
select is((select count(*) from engaged_individuals where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'admin cannot read foreign engaged_individuals');
select throws_ok($$insert into engaged_individuals (organisation_id, full_name, reference, engagement_type) values ('00000000-0000-4000-8000-000000002002', 'New Person', 'CROSS-1-E', 'agency')$$,
  '42501', null, 'admin cannot insert foreign engaged_individuals');
with changed as (update engaged_individuals set engagement_type = 'contractor' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'admin cannot update foreign engaged_individuals');
select lives_ok($$insert into engaged_individuals (organisation_id, full_name, reference, engagement_type) values ('00000000-0000-4000-8000-000000002001', 'New Person', 'NEW-1-E', 'agency')$$,
  'admin can insert own engaged_individuals');
with changed as (update engaged_individuals set engagement_type = 'contractor' where id = '00000000-0000-4000-8000-000000002102' returning id)
select is((select count(*) from changed), 1::bigint, 'admin can update own engaged_individuals');
select is((select count(*) from cos_records where id = '00000000-0000-4000-8000-000000002103'), 1::bigint, 'admin reads own cos_records');
select is((select count(*) from cos_records where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'admin cannot read foreign cos_records');
select throws_ok($$insert into cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status) values ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002201', 'CROSS-1-C', '2026-10-01', 'used')$$,
  '42501', null, 'admin cannot insert foreign cos_records');
with changed as (update cos_records set status = 'used' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'admin cannot update foreign cos_records');
select lives_ok($$insert into cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status) values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002101', 'NEW-1-C', '2026-10-01', 'used')$$,
  'admin can insert own cos_records');
with changed as (update cos_records set status = 'used' where id = '00000000-0000-4000-8000-000000002103' returning id)
select is((select count(*) from changed), 1::bigint, 'admin can update own cos_records');
select is((select count(*) from rtw_checks where id = '00000000-0000-4000-8000-000000002104'), 1::bigint, 'admin reads own rtw_checks');
select is((select count(*) from rtw_checks where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'admin cannot read foreign rtw_checks');
select throws_ok($$insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, method) values ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002202', '2026-10-01', 'manual')$$,
  '42501', null, 'admin cannot insert foreign rtw_checks');
with changed as (update rtw_checks set method = 'manual' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'admin cannot update foreign rtw_checks');
select lives_ok($$insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, method) values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002102', '2026-10-01', 'manual')$$,
  'admin can insert own rtw_checks');
with changed as (update rtw_checks set method = 'manual' where id = '00000000-0000-4000-8000-000000002104' returning id)
select is((select count(*) from changed), 1::bigint, 'admin can update own rtw_checks');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002003';
select is((select count(*) from sponsored_workers where id = '00000000-0000-4000-8000-000000002101'), 1::bigint, 'hr_user reads own sponsored_workers');
select is((select count(*) from sponsored_workers where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'hr_user cannot read foreign sponsored_workers');
select throws_ok($$insert into sponsored_workers (organisation_id, full_name, reference, status) values ('00000000-0000-4000-8000-000000002002', 'New Worker', 'CROSS-2-W', 'inactive')$$,
  '42501', null, 'hr_user cannot insert foreign sponsored_workers');
with changed as (update sponsored_workers set status = 'inactive' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot update foreign sponsored_workers');
select lives_ok($$insert into sponsored_workers (organisation_id, full_name, reference, status) values ('00000000-0000-4000-8000-000000002001', 'New Worker', 'NEW-2-W', 'inactive')$$,
  'hr_user can insert own sponsored_workers');
with changed as (update sponsored_workers set status = 'inactive' where id = '00000000-0000-4000-8000-000000002101' returning id)
select is((select count(*) from changed), 1::bigint, 'hr_user can update own sponsored_workers');
select is((select count(*) from engaged_individuals where id = '00000000-0000-4000-8000-000000002102'), 1::bigint, 'hr_user reads own engaged_individuals');
select is((select count(*) from engaged_individuals where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'hr_user cannot read foreign engaged_individuals');
select throws_ok($$insert into engaged_individuals (organisation_id, full_name, reference, engagement_type) values ('00000000-0000-4000-8000-000000002002', 'New Person', 'CROSS-2-E', 'agency')$$,
  '42501', null, 'hr_user cannot insert foreign engaged_individuals');
with changed as (update engaged_individuals set engagement_type = 'contractor' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot update foreign engaged_individuals');
select lives_ok($$insert into engaged_individuals (organisation_id, full_name, reference, engagement_type) values ('00000000-0000-4000-8000-000000002001', 'New Person', 'NEW-2-E', 'agency')$$,
  'hr_user can insert own engaged_individuals');
with changed as (update engaged_individuals set engagement_type = 'contractor' where id = '00000000-0000-4000-8000-000000002102' returning id)
select is((select count(*) from changed), 1::bigint, 'hr_user can update own engaged_individuals');
select is((select count(*) from cos_records where id = '00000000-0000-4000-8000-000000002103'), 1::bigint, 'hr_user reads own cos_records');
select is((select count(*) from cos_records where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'hr_user cannot read foreign cos_records');
select throws_ok($$insert into cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status) values ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002201', 'CROSS-2-C', '2026-10-01', 'used')$$,
  '42501', null, 'hr_user cannot insert foreign cos_records');
with changed as (update cos_records set status = 'used' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot update foreign cos_records');
select lives_ok($$insert into cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status) values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002101', 'NEW-2-C', '2026-10-01', 'used')$$,
  'hr_user can insert own cos_records');
with changed as (update cos_records set status = 'used' where id = '00000000-0000-4000-8000-000000002103' returning id)
select is((select count(*) from changed), 1::bigint, 'hr_user can update own cos_records');
select is((select count(*) from rtw_checks where id = '00000000-0000-4000-8000-000000002104'), 1::bigint, 'hr_user reads own rtw_checks');
select is((select count(*) from rtw_checks where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'hr_user cannot read foreign rtw_checks');
select throws_ok($$insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, method) values ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002202', '2026-10-01', 'manual')$$,
  '42501', null, 'hr_user cannot insert foreign rtw_checks');
with changed as (update rtw_checks set method = 'manual' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot update foreign rtw_checks');
select lives_ok($$insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, method) values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002102', '2026-10-01', 'manual')$$,
  'hr_user can insert own rtw_checks');
with changed as (update rtw_checks set method = 'manual' where id = '00000000-0000-4000-8000-000000002104' returning id)
select is((select count(*) from changed), 1::bigint, 'hr_user can update own rtw_checks');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002004';
select is((select count(*) from sponsored_workers where id = '00000000-0000-4000-8000-000000002101'), 1::bigint, 'viewer reads own sponsored_workers');
select is((select count(*) from sponsored_workers where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'viewer cannot read foreign sponsored_workers');
select throws_ok($$insert into sponsored_workers (organisation_id, full_name, reference, status) values ('00000000-0000-4000-8000-000000002002', 'New Worker', 'CROSS-3-W', 'inactive')$$,
  '42501', null, 'viewer cannot insert foreign sponsored_workers');
with changed as (update sponsored_workers set status = 'inactive' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update foreign sponsored_workers');
select throws_ok($$insert into sponsored_workers (organisation_id, full_name, reference, status) values ('00000000-0000-4000-8000-000000002001', 'New Worker', 'NEW-3-W', 'inactive')$$,
  '42501', null, 'viewer cannot insert own sponsored_workers');
with changed as (update sponsored_workers set status = 'inactive' where id = '00000000-0000-4000-8000-000000002101' returning id)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update own sponsored_workers');
select is((select count(*) from engaged_individuals where id = '00000000-0000-4000-8000-000000002102'), 1::bigint, 'viewer reads own engaged_individuals');
select is((select count(*) from engaged_individuals where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'viewer cannot read foreign engaged_individuals');
select throws_ok($$insert into engaged_individuals (organisation_id, full_name, reference, engagement_type) values ('00000000-0000-4000-8000-000000002002', 'New Person', 'CROSS-3-E', 'agency')$$,
  '42501', null, 'viewer cannot insert foreign engaged_individuals');
with changed as (update engaged_individuals set engagement_type = 'contractor' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update foreign engaged_individuals');
select throws_ok($$insert into engaged_individuals (organisation_id, full_name, reference, engagement_type) values ('00000000-0000-4000-8000-000000002001', 'New Person', 'NEW-3-E', 'agency')$$,
  '42501', null, 'viewer cannot insert own engaged_individuals');
with changed as (update engaged_individuals set engagement_type = 'contractor' where id = '00000000-0000-4000-8000-000000002102' returning id)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update own engaged_individuals');
select is((select count(*) from cos_records where id = '00000000-0000-4000-8000-000000002103'), 1::bigint, 'viewer reads own cos_records');
select is((select count(*) from cos_records where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'viewer cannot read foreign cos_records');
select throws_ok($$insert into cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status) values ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002201', 'CROSS-3-C', '2026-10-01', 'used')$$,
  '42501', null, 'viewer cannot insert foreign cos_records');
with changed as (update cos_records set status = 'used' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update foreign cos_records');
select throws_ok($$insert into cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status) values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002101', 'NEW-3-C', '2026-10-01', 'used')$$,
  '42501', null, 'viewer cannot insert own cos_records');
with changed as (update cos_records set status = 'used' where id = '00000000-0000-4000-8000-000000002103' returning id)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update own cos_records');
select is((select count(*) from rtw_checks where id = '00000000-0000-4000-8000-000000002104'), 1::bigint, 'viewer reads own rtw_checks');
select is((select count(*) from rtw_checks where organisation_id = '00000000-0000-4000-8000-000000002002'), 0::bigint, 'viewer cannot read foreign rtw_checks');
select throws_ok($$insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, method) values ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002202', '2026-10-01', 'manual')$$,
  '42501', null, 'viewer cannot insert foreign rtw_checks');
with changed as (update rtw_checks set method = 'manual' where organisation_id = '00000000-0000-4000-8000-000000002002' returning id)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update foreign rtw_checks');
select throws_ok($$insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, method) values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002102', '2026-10-01', 'manual')$$,
  '42501', null, 'viewer cannot insert own rtw_checks');
with changed as (update rtw_checks set method = 'manual' where id = '00000000-0000-4000-8000-000000002104' returning id)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update own rtw_checks');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000002003';
select throws_ok($$insert into cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status)
  values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002201', 'BAD-COS', '2026-10-01', 'assigned')$$, '23503', null, 'CoS cannot link to a worker in another organisation');
select throws_ok($$insert into rtw_checks (organisation_id, engaged_individual_id, checked_on, method)
  values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002202', '2026-10-01', 'online')$$, '23503', null, 'RTW cannot link to foreign engaged_individual_id');
select throws_ok($$insert into rtw_checks (organisation_id, sponsored_worker_id, checked_on, method)
  values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002201', '2026-10-01', 'online')$$, '23503', null, 'RTW cannot link to foreign sponsored_worker_id');
select throws_ok($$insert into sponsored_workers (organisation_id, full_name, reference, status) values
  ('00000000-0000-4000-8000-000000002001', 'Atomic Test', 'ATOMIC-NEW', 'active'), ('00000000-0000-4000-8000-000000002001', 'Conflicting Test', 'WA', 'active')$$,
  '23505', null, 'A conflicting row rejects the entire bulk insert');
select is((select count(*) from sponsored_workers where reference = 'ATOMIC-NEW'), 0::bigint,
  'A failed bulk insert leaves no first row behind');
select throws_ok($$insert into sponsored_workers (id, organisation_id, full_name, reference, status)
  values ('00000000-0000-4000-8000-000000002201', '00000000-0000-4000-8000-000000002001', 'New Worker', 'ID-PROBE', 'active')$$,
  '42501', null, 'Clients cannot supply record IDs');
select throws_ok($$update sponsored_workers set organisation_id = '00000000-0000-4000-8000-000000002002'
  where id = '00000000-0000-4000-8000-000000002101'$$,
  '42501', null, 'Clients cannot change a record organisation');

set local request.jwt.claims = '{"aal":"aal1"}';
select is((select count(*) from sponsored_workers), 0::bigint, 'AAL1 cannot read sponsored_workers');
select is((select count(*) from engaged_individuals), 0::bigint, 'AAL1 cannot read engaged_individuals');
select is((select count(*) from cos_records), 0::bigint, 'AAL1 cannot read cos_records');
select is((select count(*) from rtw_checks), 0::bigint, 'AAL1 cannot read rtw_checks');

reset role;
select * from finish();
rollback;
