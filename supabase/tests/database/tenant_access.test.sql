begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
set local search_path = public, extensions;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002'), ('00000000-0000-4000-8000-000000000003'), ('00000000-0000-4000-8000-000000000004'), ('00000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000006'), ('00000000-0000-4000-8000-000000000007'), ('00000000-0000-4000-8000-000000000008');
insert into organisations (id, name) values ('00000000-0000-4000-8000-000000000100', 'Tenant A'), ('00000000-0000-4000-8000-000000000200', 'Tenant B');
insert into profiles (id, display_name) values
  ('00000000-0000-4000-8000-000000000001', 'Owner A'), ('00000000-0000-4000-8000-000000000002', 'Admin A'), ('00000000-0000-4000-8000-000000000003', 'HR A'),
  ('00000000-0000-4000-8000-000000000004', 'Viewer A'), ('00000000-0000-4000-8000-000000000005', 'Owner B');
insert into memberships (organisation_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000001', 'owner'), ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000002', 'admin'),
  ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000003', 'hr_user'), ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000004', 'viewer'),
  ('00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000005', 'owner'), ('00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000008', 'viewer');

set local role service_role;
insert into audit_log (organisation_id, event)
values ('00000000-0000-4000-8000-000000000100', 'organisation_created'), ('00000000-0000-4000-8000-000000000200', 'organisation_created');
reset role;

select plan(111);

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select ok(sponsor_guard_private.is_member('00000000-0000-4000-8000-000000000100'), 'owner is a member of A');
select ok(sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000100', 'owner'), 'owner has their assigned role');
select ok(not sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000100', 'admin'), 'owner lacks the other role');
select ok(not sponsor_guard_private.is_member('00000000-0000-4000-8000-000000000200'), 'owner is not a member of B');
select ok(not sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000200', 'owner'), 'owner has no role in B');
select is((select count(*) from organisations where id = '00000000-0000-4000-8000-000000000100'), 1::bigint, 'owner reads A');
select is((select count(*) from organisations where id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'owner cannot read B');
select is((select count(*) from memberships where organisation_id = '00000000-0000-4000-8000-000000000100'), 4::bigint, 'owner reads the A roster');
select is((select count(*) from memberships where organisation_id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'owner cannot read the B roster');
select is((select count(*) from audit_log where organisation_id = '00000000-0000-4000-8000-000000000100'), 1::bigint, 'owner audit access in A');
select is((select count(*) from audit_log where organisation_id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'owner cannot read the B audit log');
select is((select count(*) from profiles), 1::bigint, 'owner reads only their own profile');
with changed as (
  update profiles set display_name = 'Updated' where id = '00000000-0000-4000-8000-000000000005' returning 1
)
select is((select count(*) from changed), 0::bigint, 'owner cannot update a profile in B');
with changed as (
  update profiles set display_name = 'Updated' where id = '00000000-0000-4000-8000-000000000001' returning 1
)
select is((select count(*) from changed), 1::bigint, 'owner can update their own profile');
with changed as (
  update organisations set name = 'Updated A' where id = '00000000-0000-4000-8000-000000000100' returning 1
)
select is((select count(*) from changed), 1::bigint, 'owner organisation update in A');
with changed as (
  update organisations set name = 'Updated B' where id = '00000000-0000-4000-8000-000000000200' returning 1
)
select is((select count(*) from changed), 0::bigint, 'owner cannot update B');
select throws_ok($$insert into memberships values ('00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000007', 'viewer')$$, '42501', null, 'owner cannot insert membership in B');
with changed as (
  update memberships set role = 'hr_user' where organisation_id = '00000000-0000-4000-8000-000000000200' and user_id = '00000000-0000-4000-8000-000000000008' returning 1
)
select is((select count(*) from changed), 0::bigint, 'owner cannot update membership in B');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000200' and user_id = '00000000-0000-4000-8000-000000000008' returning 1
)
select is((select count(*) from changed), 0::bigint, 'owner cannot delete membership in B');
select lives_ok($$insert into memberships values ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000006', 'viewer')$$, 'owner membership insert in A');
with changed as (
  update memberships set role = 'hr_user' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000006' returning 1
)
select is((select count(*) from changed), 1::bigint, 'owner can update a lower role');
select throws_ok($$update memberships set role = 'owner' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000006'$$, '42501', null, 'owner cannot promote to owner');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000006' returning 1
)
select is((select count(*) from changed), 1::bigint, 'owner can delete a lower role');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000001' returning 1
)
select is((select count(*) from changed), 0::bigint, 'owner cannot delete the owner');
select throws_ok($$insert into audit_log (organisation_id, event) values ('00000000-0000-4000-8000-000000000100', 'membership_changed')$$, '42501', null, 'owner cannot write audit events');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select ok(sponsor_guard_private.is_member('00000000-0000-4000-8000-000000000100'), 'admin is a member of A');
select ok(sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000100', 'admin'), 'admin has their assigned role');
select ok(not sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000100', 'owner'), 'admin lacks the other role');
select ok(not sponsor_guard_private.is_member('00000000-0000-4000-8000-000000000200'), 'admin is not a member of B');
select ok(not sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000200', 'admin'), 'admin has no role in B');
select is((select count(*) from organisations where id = '00000000-0000-4000-8000-000000000100'), 1::bigint, 'admin reads A');
select is((select count(*) from organisations where id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'admin cannot read B');
select is((select count(*) from memberships where organisation_id = '00000000-0000-4000-8000-000000000100'), 4::bigint, 'admin reads the A roster');
select is((select count(*) from memberships where organisation_id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'admin cannot read the B roster');
select is((select count(*) from audit_log where organisation_id = '00000000-0000-4000-8000-000000000100'), 1::bigint, 'admin audit access in A');
select is((select count(*) from audit_log where organisation_id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'admin cannot read the B audit log');
select is((select count(*) from profiles), 1::bigint, 'admin reads only their own profile');
with changed as (
  update profiles set display_name = 'Updated' where id = '00000000-0000-4000-8000-000000000005' returning 1
)
select is((select count(*) from changed), 0::bigint, 'admin cannot update a profile in B');
with changed as (
  update profiles set display_name = 'Updated' where id = '00000000-0000-4000-8000-000000000002' returning 1
)
select is((select count(*) from changed), 1::bigint, 'admin can update their own profile');
with changed as (
  update organisations set name = 'Updated A' where id = '00000000-0000-4000-8000-000000000100' returning 1
)
select is((select count(*) from changed), 1::bigint, 'admin organisation update in A');
with changed as (
  update organisations set name = 'Updated B' where id = '00000000-0000-4000-8000-000000000200' returning 1
)
select is((select count(*) from changed), 0::bigint, 'admin cannot update B');
select throws_ok($$insert into memberships values ('00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000007', 'viewer')$$, '42501', null, 'admin cannot insert membership in B');
with changed as (
  update memberships set role = 'hr_user' where organisation_id = '00000000-0000-4000-8000-000000000200' and user_id = '00000000-0000-4000-8000-000000000008' returning 1
)
select is((select count(*) from changed), 0::bigint, 'admin cannot update membership in B');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000200' and user_id = '00000000-0000-4000-8000-000000000008' returning 1
)
select is((select count(*) from changed), 0::bigint, 'admin cannot delete membership in B');
select lives_ok($$insert into memberships values ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000006', 'viewer')$$, 'admin membership insert in A');
with changed as (
  update memberships set role = 'hr_user' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000006' returning 1
)
select is((select count(*) from changed), 1::bigint, 'admin can update a lower role');
select throws_ok($$update memberships set role = 'owner' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000006'$$, '42501', null, 'admin cannot promote to owner');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000006' returning 1
)
select is((select count(*) from changed), 1::bigint, 'admin can delete a lower role');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000001' returning 1
)
select is((select count(*) from changed), 0::bigint, 'admin cannot delete the owner');
select throws_ok($$insert into audit_log (organisation_id, event) values ('00000000-0000-4000-8000-000000000100', 'membership_changed')$$, '42501', null, 'admin cannot write audit events');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
select ok(sponsor_guard_private.is_member('00000000-0000-4000-8000-000000000100'), 'hr_user is a member of A');
select ok(sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000100', 'hr_user'), 'hr_user has their assigned role');
select ok(not sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000100', 'owner'), 'hr_user lacks the other role');
select ok(not sponsor_guard_private.is_member('00000000-0000-4000-8000-000000000200'), 'hr_user is not a member of B');
select ok(not sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000200', 'hr_user'), 'hr_user has no role in B');
select is((select count(*) from organisations where id = '00000000-0000-4000-8000-000000000100'), 1::bigint, 'hr_user reads A');
select is((select count(*) from organisations where id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'hr_user cannot read B');
select is((select count(*) from memberships where organisation_id = '00000000-0000-4000-8000-000000000100'), 4::bigint, 'hr_user reads the A roster');
select is((select count(*) from memberships where organisation_id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'hr_user cannot read the B roster');
select is((select count(*) from audit_log where organisation_id = '00000000-0000-4000-8000-000000000100'), 0::bigint, 'hr_user audit access in A');
select is((select count(*) from audit_log where organisation_id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'hr_user cannot read the B audit log');
select is((select count(*) from profiles), 1::bigint, 'hr_user reads only their own profile');
with changed as (
  update profiles set display_name = 'Updated' where id = '00000000-0000-4000-8000-000000000005' returning 1
)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot update a profile in B');
with changed as (
  update profiles set display_name = 'Updated' where id = '00000000-0000-4000-8000-000000000003' returning 1
)
select is((select count(*) from changed), 1::bigint, 'hr_user can update their own profile');
with changed as (
  update organisations set name = 'Updated A' where id = '00000000-0000-4000-8000-000000000100' returning 1
)
select is((select count(*) from changed), 0::bigint, 'hr_user organisation update in A');
with changed as (
  update organisations set name = 'Updated B' where id = '00000000-0000-4000-8000-000000000200' returning 1
)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot update B');
select throws_ok($$insert into memberships values ('00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000007', 'viewer')$$, '42501', null, 'hr_user cannot insert membership in B');
with changed as (
  update memberships set role = 'hr_user' where organisation_id = '00000000-0000-4000-8000-000000000200' and user_id = '00000000-0000-4000-8000-000000000008' returning 1
)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot update membership in B');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000200' and user_id = '00000000-0000-4000-8000-000000000008' returning 1
)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot delete membership in B');
select throws_ok($$insert into memberships values ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000006', 'viewer')$$, '42501', null, 'hr_user membership insert in A');
with changed as (
  update memberships set role = 'hr_user' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000004' returning 1
)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot update roles in A');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000004' returning 1
)
select is((select count(*) from changed), 0::bigint, 'hr_user cannot delete roles in A');
select throws_ok($$insert into audit_log (organisation_id, event) values ('00000000-0000-4000-8000-000000000100', 'membership_changed')$$, '42501', null, 'hr_user cannot write audit events');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004';
select ok(sponsor_guard_private.is_member('00000000-0000-4000-8000-000000000100'), 'viewer is a member of A');
select ok(sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000100', 'viewer'), 'viewer has their assigned role');
select ok(not sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000100', 'owner'), 'viewer lacks the other role');
select ok(not sponsor_guard_private.is_member('00000000-0000-4000-8000-000000000200'), 'viewer is not a member of B');
select ok(not sponsor_guard_private.has_role('00000000-0000-4000-8000-000000000200', 'viewer'), 'viewer has no role in B');
select is((select count(*) from organisations where id = '00000000-0000-4000-8000-000000000100'), 1::bigint, 'viewer reads A');
select is((select count(*) from organisations where id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'viewer cannot read B');
select is((select count(*) from memberships where organisation_id = '00000000-0000-4000-8000-000000000100'), 4::bigint, 'viewer reads the A roster');
select is((select count(*) from memberships where organisation_id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'viewer cannot read the B roster');
select is((select count(*) from audit_log where organisation_id = '00000000-0000-4000-8000-000000000100'), 0::bigint, 'viewer audit access in A');
select is((select count(*) from audit_log where organisation_id = '00000000-0000-4000-8000-000000000200'), 0::bigint, 'viewer cannot read the B audit log');
select is((select count(*) from profiles), 1::bigint, 'viewer reads only their own profile');
with changed as (
  update profiles set display_name = 'Updated' where id = '00000000-0000-4000-8000-000000000005' returning 1
)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update a profile in B');
with changed as (
  update profiles set display_name = 'Updated' where id = '00000000-0000-4000-8000-000000000004' returning 1
)
select is((select count(*) from changed), 1::bigint, 'viewer can update their own profile');
with changed as (
  update organisations set name = 'Updated A' where id = '00000000-0000-4000-8000-000000000100' returning 1
)
select is((select count(*) from changed), 0::bigint, 'viewer organisation update in A');
with changed as (
  update organisations set name = 'Updated B' where id = '00000000-0000-4000-8000-000000000200' returning 1
)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update B');
select throws_ok($$insert into memberships values ('00000000-0000-4000-8000-000000000200', '00000000-0000-4000-8000-000000000007', 'viewer')$$, '42501', null, 'viewer cannot insert membership in B');
with changed as (
  update memberships set role = 'hr_user' where organisation_id = '00000000-0000-4000-8000-000000000200' and user_id = '00000000-0000-4000-8000-000000000008' returning 1
)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update membership in B');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000200' and user_id = '00000000-0000-4000-8000-000000000008' returning 1
)
select is((select count(*) from changed), 0::bigint, 'viewer cannot delete membership in B');
select throws_ok($$insert into memberships values ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000006', 'viewer')$$, '42501', null, 'viewer membership insert in A');
with changed as (
  update memberships set role = 'hr_user' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000004' returning 1
)
select is((select count(*) from changed), 0::bigint, 'viewer cannot update roles in A');
with changed as (
  delete from memberships where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000004' returning 1
)
select is((select count(*) from changed), 0::bigint, 'viewer cannot delete roles in A');
select throws_ok($$insert into audit_log (organisation_id, event) values ('00000000-0000-4000-8000-000000000100', 'membership_changed')$$, '42501', null, 'viewer cannot write audit events');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
with changed as (
  update memberships set role = 'viewer' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000002' returning 1
)
select is((select count(*) from changed), 1::bigint, 'owner can demote an admin');
with changed as (
  update memberships set role = 'admin' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000002' returning 1
)
select is((select count(*) from changed), 1::bigint, 'owner can promote an admin');
select throws_ok($$update memberships set organisation_id = '00000000-0000-4000-8000-000000000200' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000004'$$, '42501', null, 'owner cannot move membership to another tenant');
select throws_ok($$insert into organisations (name) values ('Unprovisioned')$$, '42501', null, 'owner cannot provision an organisation directly');
select throws_ok($$update audit_log set event = 'membership_changed'$$, '42501', null, 'owner cannot edit audit events');
select throws_ok($$delete from audit_log$$, '42501', null, 'owner cannot delete audit events');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select throws_ok($$update memberships set role = 'admin' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000004'$$, '42501', null, 'admin cannot grant admin');
with changed as (
  update memberships set role = 'viewer' where organisation_id = '00000000-0000-4000-8000-000000000100' and user_id = '00000000-0000-4000-8000-000000000002' returning 1
)
select is((select count(*) from changed), 0::bigint, 'admin cannot change an admin assignment');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000007';
select is((select count(*) from organisations), 0::bigint, 'authenticated non-member sees no organisations');
select throws_ok($$insert into profiles values ('00000000-0000-4000-8000-000000000006', 'Other')$$, '42501', null, 'authenticated user cannot create another user profile');
select lives_ok($$insert into profiles values ('00000000-0000-4000-8000-000000000007', 'Own')$$, 'authenticated user can create their own profile');

reset role;
set local role anon;
select throws_ok($$select * from organisations$$, '42501', null, 'anonymous callers cannot read organisations');
select throws_ok($$select sponsor_guard_private.is_member('00000000-0000-4000-8000-000000000100')$$, '42501', null, 'anonymous callers cannot invoke membership helpers');

reset role;
set local role service_role;
select throws_ok($$update audit_log set event = 'membership_changed'$$, '42501', null, 'service role cannot edit audit events');
select throws_ok($$delete from audit_log$$, '42501', null, 'service role cannot delete audit events');

reset role;
select * from finish();
rollback;
