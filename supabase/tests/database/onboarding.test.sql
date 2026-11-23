begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
set local search_path = public, extensions;
select plan(12);

insert into auth.users (id) values ('00000000-0000-4000-8000-000000001001');
set local role anon;
select throws_ok($$select onboard_organisation('Example', 'Owner')$$, '42501', null, 'Anonymous callers cannot onboard');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001001';
set local request.jwt.claims = '{"aal":"aal1"}';
select throws_ok($$select onboard_organisation('Example', 'Owner')$$, '42501', null, 'AAL1 cannot onboard');

set local request.jwt.claims = '{"aal":"aal2"}';
select throws_ok($$select onboard_organisation('', 'Owner')$$, '22023', null, 'Organisation name is required');
select lives_ok($$select onboard_organisation('Example', 'Owner')$$, 'AAL2 can onboard');
select is((select role::text from memberships where user_id = auth.uid()), 'owner', 'Caller becomes owner');
select is((select display_name from profiles where id = auth.uid()), 'Owner', 'Caller profile is provisioned');
select is((select event::text from audit_log where organisation_id in (select id from organisations where name = 'Example')),
  'organisation_created', 'Provisioning records a scoped audit event');
select is(onboard_organisation('Duplicate', 'Different name'),
  (select id from organisations where name = 'Example'), 'Retry returns the same organisation');

set local request.jwt.claims = '{"aal":"aal1"}';
select is((select count(*) from organisations where name = 'Example'), 0::bigint, 'AAL1 cannot read the organisation');
select is((select count(*) from memberships), 0::bigint, 'AAL1 cannot read memberships');
select is((select count(*) from profiles), 0::bigint, 'AAL1 cannot read the profile');
select is((select count(*) from audit_log), 0::bigint, 'AAL1 cannot read audit events');

reset role;
select * from finish();
rollback;
