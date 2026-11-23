begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
set local search_path = public, extensions;
select plan(25);

insert into auth.users (id) values
 ('30000000-0000-4000-8000-000000000001'), ('30000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000003'), ('30000000-0000-4000-8000-000000000004');
insert into organisations (id,name) values
 ('30000000-0000-4000-8000-000000000010','Synthetic Ops'),
 ('30000000-0000-4000-8000-000000000020','Synthetic Other');
update organisation_billing set plan='pro' where organisation_id in
 ('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020');
insert into memberships values
 ('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000001','owner'),
 ('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000002','hr_user'),
 ('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000004','viewer'),
 ('30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000003','owner');
insert into sponsored_workers (id,organisation_id,full_name,reference,status) values
 ('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000010','Synthetic A','OPS-A','active'),
 ('30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000020','Synthetic B','OPS-B','active');
insert into rtw_checks (id,organisation_id,sponsored_worker_id,checked_on,follow_up_on,method) values
 ('30000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000011','2026-01-01','2026-06-01','online'),
 ('30000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000011','2026-02-01','2026-06-02','online'),
 ('30000000-0000-4000-8000-000000000022','30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000021','2026-01-01','2026-06-01','online');
insert into evidence_requests(id,organisation_id,worker_id,document_type,token_hash,expires_at) values
 ('30000000-0000-4000-8000-000000000014','30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000011','other',repeat('a',64),now()+interval '1 day'),
 ('30000000-0000-4000-8000-000000000015','30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000011','other',repeat('b',64),now()-interval '1 day');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select results_eq('select record_id from weekly_action_sources', $$ values ('30000000-0000-4000-8000-000000000013'::uuid) $$,
 'queue returns only the latest check and never another tenant');
select lives_ok($$ insert into weekly_actions(organisation_id,kind,record_id,assignee,escalated) values
 ('30000000-0000-4000-8000-000000000010','rtw','30000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000002',true) $$,
 'owner assigns and escalates a real action');
select throws_ok($$ update weekly_actions set assignee = '30000000-0000-4000-8000-000000000003' $$,'23503',null,
 'an assignee from another organisation is rejected');
select throws_ok('select token_hash from evidence_requests','42501',null,'manager never reads bearer hashes through API');
select throws_ok($$ select * from reserve_evidence_upload(repeat('a',64),'application/pdf',8) $$,'42501',null,'member cannot call server upload reservation');
select is(review_evidence_request('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000014','approved'),false,
 'an open request cannot be promoted');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select throws_ok('update weekly_actions set escalated = false','42501',null,'HR cannot clear escalation through API');
select lives_ok($$ update weekly_actions set handed_back = true $$, 'HR can hand back an action');
select lives_ok($$ insert into action_comments(organisation_id,kind,record_id,body)
 values ('30000000-0000-4000-8000-000000000010','rtw','30000000-0000-4000-8000-000000000013','Synthetic next step') $$,
 'HR can comment on a real action');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000004","aal":"aal2"}',true);
select throws_ok($$ insert into action_comments(organisation_id,kind,record_id,body)
 values ('30000000-0000-4000-8000-000000000010','rtw','30000000-0000-4000-8000-000000000013','Synthetic next step') $$,'42501',null,
 'a viewer cannot comment');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select is((select count(*) from action_comments),0::bigint,'another tenant cannot read comments');
select is((select count(id) from evidence_requests),0::bigint,'another tenant cannot read requests');
reset role;

set local role service_role;
select is((select count(*) from reserve_evidence_upload(repeat('b',64),'application/pdf',8)),0::bigint,'expired links cannot be reserved');
select is((select count(*) from reserve_evidence_upload(repeat('a',64),'application/pdf',8)),1::bigint,'valid link reserves one private document');
select is((select count(*) from reserve_evidence_upload(repeat('a',64),'application/pdf',8)),0::bigint,'a second upload cannot reserve the same link');
reset role;
select is((select scan_status from documents where organisation_id='30000000-0000-4000-8000-000000000010'),'not_scanned',
 'reservation starts pending without claiming a scan');
insert into storage.objects(bucket_id,name)
 select 'sponsorguard-documents',object_path from documents where organisation_id='30000000-0000-4000-8000-000000000010';
set local role service_role;
select ok(finish_evidence_upload(repeat('a',64),
 (select id from documents where organisation_id='30000000-0000-4000-8000-000000000010'),true),
 'clean upload with an object becomes a submitted request');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select is((select count(*) from documents),0::bigint,'unreviewed file is hidden from the ordinary vault');
select is((select count(*) from storage.objects where bucket_id='sponsorguard-documents'),0::bigint,
 'unreviewed object cannot be accessed through ordinary storage policies');
select is(jsonb_array_length(export_privacy_person(
 '30000000-0000-4000-8000-000000000010','worker','30000000-0000-4000-8000-000000000011','json')->'documents'),1,
 'the restricted person export includes clean submitted evidence');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select is(review_evidence_request('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000014','approved'),false,
 'HR cannot approve external evidence');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select ok(review_evidence_request('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000014','approved'),
 'native manager can promote a scanned submission');
select is((select count(*) from documents where state='ready' and scan_status='clean'),1::bigint,'approved evidence is filed');
select is(review_evidence_request('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000014','approved'),false,
 'approval cannot be replayed');
select ok(review_evidence_request('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000015','revoked'),
 'the native manager can revoke an open request');
reset role;
select * from finish();
rollback;
