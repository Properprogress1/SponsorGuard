begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, service_role, anon;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-4000-8000-000000013101', 'partner@example.com', now()),
 ('00000000-0000-4000-8000-000000013102', 'staff@example.com', now()),
 ('00000000-0000-4000-8000-000000013103', 'client@example.com', now()),
 ('00000000-0000-4000-8000-000000013104', 'other@example.com', now()),
 ('00000000-0000-4000-8000-000000013105', 'unconfirmed@example.com', null),
 ('00000000-0000-4000-8000-000000013106', 'third@example.com', now());
insert into organisations (id,name) values
 ('00000000-0000-4000-8000-000000013001','Partner A'),
 ('00000000-0000-4000-8000-000000013002','Client A'),
 ('00000000-0000-4000-8000-000000013003','Client B'),
 ('00000000-0000-4000-8000-000000013004','Partner B'),
 ('00000000-0000-4000-8000-000000013005','Indirect Client');
insert into memberships (organisation_id,user_id,role) values
 ('00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013101','owner'),
 ('00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013102','viewer'),
 ('00000000-0000-4000-8000-000000013002','00000000-0000-4000-8000-000000013103','owner'),
 ('00000000-0000-4000-8000-000000013003','00000000-0000-4000-8000-000000013103','owner'),
 ('00000000-0000-4000-8000-000000013003','00000000-0000-4000-8000-000000013105','owner'),
 ('00000000-0000-4000-8000-000000013004','00000000-0000-4000-8000-000000013104','owner'),
 ('00000000-0000-4000-8000-000000013005','00000000-0000-4000-8000-000000013106','owner');
update organisation_billing set plan = 'pro' where organisation_id in
 ('00000000-0000-4000-8000-000000013002','00000000-0000-4000-8000-000000013003');
insert into sponsored_workers (organisation_id,full_name,reference,status) values
 ('00000000-0000-4000-8000-000000013002','Synthetic Client A','CLIENT-A','active'),
 ('00000000-0000-4000-8000-000000013003','Synthetic Client B','CLIENT-B','active');
insert into partner_organisations(organisation_id) values
 ('00000000-0000-4000-8000-000000013002'), ('00000000-0000-4000-8000-000000013004');
insert into partner_links (partner_id,client_id,role) values
 ('00000000-0000-4000-8000-000000013002','00000000-0000-4000-8000-000000013005','admin'),
 ('00000000-0000-4000-8000-000000013004','00000000-0000-4000-8000-000000013003','admin');

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013101';
select lives_ok($$select configure_partner('00000000-0000-4000-8000-000000013001','#123456','#abcdef',null,false)$$,
 'Partner owner can register and set branding');
select throws_ok($$select configure_partner('00000000-0000-4000-8000-000000013001','#123456','#abcdef','data:image/svg+xml;base64,AA==',false)$$,
 '22023', null, 'Active content cannot be supplied as a logo');
select throws_ok($$select configure_partner('00000000-0000-4000-8000-000000013003','#123456','#abcdef',null,false)$$,
 '42501', null, 'Cannot configure branding on a foreign organisation');
select create_partner_invitation('00000000-0000-4000-8000-000000013001','CLIENT@example.com',repeat('a',64),'admin') as invite \gset
select is((select count(*) from workspace_access()),1::bigint,'Inviting a client grants no access');
select is((select count(*) from sponsored_workers),0::bigint,'Partner has no access to unaccepted clients');
select throws_ok($$select token_hash from partner_invitations$$,'42501',null,'Invitation secrets have no client grants');
select throws_ok($$select create_partner_invitation('00000000-0000-4000-8000-000000013001','client@example.com',repeat('b',64),'owner')$$,
 '22023',null,'Owner is never delegated');
select create_partner_invitation('00000000-0000-4000-8000-000000013001','unconfirmed@example.com',repeat('b',64),'viewer') as unconfirmed \gset
select create_partner_invitation('00000000-0000-4000-8000-000000013001','client@example.com',repeat('c',64),'viewer') as cancelled \gset
select ok(cancel_partner_invitation(:'cancelled'), 'Partner can cancel an unused invitation');
select create_partner_invitation('00000000-0000-4000-8000-000000013001','client@example.com',repeat('d',64),'viewer') as expired \gset
reset role;
update partner_invitations set expires_at = now() - interval '1 second' where id = :'expired';
set local role authenticated;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013104';
select is((select count(*) from inspect_partner_invitation(repeat('a',64))),0::bigint,'Wrong email cannot preview a valid token');
select throws_ok($$select accept_partner_invitation('00000000-0000-4000-8000-000000013004',repeat('a',64))$$,
 '22023',null,'Wrong recipient cannot consent');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013105';
select is((select count(*) from inspect_partner_invitation(repeat('b',64))),0::bigint,'Unverified email cannot view an invitation');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013103';
select is((select partner_name from inspect_partner_invitation(repeat('a',64))),'Partner A','Only the verified invited owner can preview partner name');
select is((select count(*) from inspect_partner_invitation(repeat('c',64))),0::bigint,'Cancelled invitation is invalid');
select is((select count(*) from inspect_partner_invitation(repeat('d',64))),0::bigint,'Expired invitation is invalid');
select accept_partner_invitation('00000000-0000-4000-8000-000000013002',repeat('a',64)) as link \gset
select throws_ok($$select accept_partner_invitation('00000000-0000-4000-8000-000000013003',repeat('a',64))$$,
 '22023',null,'Consent consumes the invitation');
select is((select count(*) from organisations where name = 'Partner A'),0::bigint,'Client consent does not grant access into the partner workspace');
select is((select organisation_name from list_partner_connections('00000000-0000-4000-8000-000000013002') where id = :'link'),
 'Partner A','Client can identify their own partner');
select is((select partner_name from workspace_partner_brand('00000000-0000-4000-8000-000000013002')),
 'Client A', 'A client uses its own brand when it has one');
select is((select count(id) from partner_invitations),0::bigint,'Clients cannot inspect partner invitation lists');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013101';
select results_eq($$select organisation_name, role::text from workspace_access() order by organisation_name$$,
 $$values ('Client A','admin'),('Partner A','owner')$$,'Switcher lists direct workspace and consented client only');
select results_eq($$select reference from sponsored_workers$$,$$values ('CLIENT-A')$$,'Partner cannot see the unrelated client record');
select is((select primary_colour from workspace_partner_brand('00000000-0000-4000-8000-000000013002')),
 '#123456','Linked workspaces render the delegated partner brand');
select is((select count(*) from workspace_partner_brand('00000000-0000-4000-8000-000000013003')),0::bigint,'Unlinked workspace branding is inaccessible');
select is((select count(*) from organisations where name = 'Indirect Client'),0::bigint,'Access does not follow a linked client’s own partner links');
select is((select count(*) from memberships where organisation_id = '00000000-0000-4000-8000-000000013002'),0::bigint,
 'Delegated admins cannot read native client membership lists');
select throws_ok($$insert into memberships (organisation_id,user_id,role) values
 ('00000000-0000-4000-8000-000000013002','00000000-0000-4000-8000-000000013101','viewer')$$,
 '42501',null,'Delegated admins cannot persist their own client membership');
with changed as (update organisations set name='Rejected' where id='00000000-0000-4000-8000-000000013002' returning id)
select is((select count(*) from changed),0::bigint,'Delegated admins cannot rename a client');
select lives_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status)
 values ('00000000-0000-4000-8000-000000013002','Synthetic Delegated Worker','DELEGATED','active')$$,
 'Delegated admins can operate on linked client records');
select throws_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status)
 values ('00000000-0000-4000-8000-000000013003','Rejected','FOREIGN','active')$$,
 '42501',null,'Partner cannot write into an unlinked client');
select ok(not update_partner_link(:'link','hr_user'),'Partner cannot change its own client role');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013102';
select is((select role::text from workspace_access() where via_partner is not null),'viewer','Partner staff role also caps client access');
select throws_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status)
 values ('00000000-0000-4000-8000-000000013002','Rejected','VIEWER','active')$$,
 '42501',null,'Partner viewer cannot edit a client even on an admin link');
set local request.jwt.claims = '{"aal":"aal1"}';
select is((select count(*) from workspace_access()),0::bigint,'Switcher requires verified MFA');
select is((select count(*) from sponsored_workers),0::bigint,'Delegated record access requires MFA');

set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013103';
select ok(update_partner_link(:'link','viewer'),'Client owner can reduce the role');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013101';
select is((select role::text from workspace_access() where via_partner is not null),'viewer','Changed link role applies immediately');
select throws_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status)
 values ('00000000-0000-4000-8000-000000013002','Rejected','DOWNGRADED','active')$$,
 '42501',null,'Role reduction prevents further edits');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013103';
select ok(update_partner_link(:'link',null),'Client owner can revoke partner access');
select ok((select revoked_at is not null from partner_links where id = :'link'),'Client retains revocation history');
select is((select count(*) from sponsored_workers where reference = 'CLIENT-A'),1::bigint,'Client retains native access');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013101';
select is((select count(*) from workspace_access()),1::bigint,'Revoked client disappears from switcher');
select is((select count(*) from sponsored_workers),0::bigint,'Revocation removes client API access');
select is((select count(id) from partner_links),0::bigint,'Revoked link is hidden from partner-side queries');
select is((select count(*) from list_partner_connections('00000000-0000-4000-8000-000000013001')),0::bigint,
 'Revoked client name is hidden from partner connections');
select is((select count(*) from workspace_partner_brand('00000000-0000-4000-8000-000000013002')),0::bigint,
 'Revoked workspace no longer exposes branding');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000013104';
select results_eq($$select reference from sponsored_workers$$,$$values ('CLIENT-B')$$,'Another partner retains only its own linked client');

set local role anon;
select throws_ok($$select * from workspace_access()$$,'42501',null,'Anonymous callers cannot enumerate workspaces');
reset role;
select * from finish();
rollback;
