begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, service_role;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id) values ('00000000-0000-4000-8000-000000014101'), ('00000000-0000-4000-8000-000000014102');
insert into organisations (id,name) values ('00000000-0000-4000-8000-000000014001','Privacy A'), ('00000000-0000-4000-8000-000000014002','Privacy B');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014002');
insert into memberships (organisation_id,user_id,role) values
 ('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014101','owner'),
 ('00000000-0000-4000-8000-000000014002','00000000-0000-4000-8000-000000014102','owner');
insert into sponsored_workers (organisation_id,id,full_name,reference,status) values
 ('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014201','Synthetic Erasure Canary','ERASURE-REFERENCE','active'),
 ('00000000-0000-4000-8000-000000014002','00000000-0000-4000-8000-000000014202','Synthetic Foreign Person','FOREIGN','active');
insert into engaged_individuals (organisation_id,id,full_name,reference,engagement_type,check_responsibility) values
 ('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014203','Synthetic Due Canary','DUE-REFERENCE','employee','Synthetic Responsibility Canary');
insert into key_personnel (organisation_id,id,full_name,role,leaving) values
 ('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014204','Synthetic Handover Canary','Key Contact',true);
insert into rtw_checks (organisation_id,sponsored_worker_id,checked_on,follow_up_on,method) values
 ('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014201','2026-01-01','2026-06-01','manual');
insert into cos_records (organisation_id,sponsored_worker_id,reference,assigned_on,status) values
 ('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014201','ERASURE-COS','2026-01-01','assigned');
insert into documents (organisation_id,id,sponsored_worker_id,document_type,content_type,size_bytes,scan_status,state) values
 ('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014301','00000000-0000-4000-8000-000000014201','identity','image/png',80,'not_scanned','ready');
insert into document_notifications(organisation_id,document_id,days_before,remind_on) values
 ('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014301',7,'2026-01-01');
insert into audit_pack_jobs (id,organisation_id,requested_by,checklist,status,attempt,generated_at) values
 ('00000000-0000-4000-8000-000000014401','00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014101','{}','ready','00000000-0000-4000-8000-000000014501',now()),
 ('00000000-0000-4000-8000-000000014402','00000000-0000-4000-8000-000000014002','00000000-0000-4000-8000-000000014102','{}','ready','00000000-0000-4000-8000-000000014502',now());
insert into storage.objects (bucket_id,name,created_at) values
 ('sponsorguard-audit-packs','00000000-0000-4000-8000-000000014001/00000000-0000-4000-8000-000000014403/00000000-0000-4000-8000-000000014503.zip',now()-interval '1 hour');

select string_agg(encode(entry_hash,'hex'),'' order by sequence) as original_hashes from ledger_entries where organisation_id='00000000-0000-4000-8000-000000014001' \gset
set local role service_role;
select issue_passport_share('00000000-0000-4000-8000-000000014001','00000000-0000-4000-8000-000000014101',
 repeat('e',64),null,'people',current_date+3,array['00000000-0000-4000-8000-000000014201'::uuid],'{}',null,null) as share \gset
select lives_ok($$select log_privacy_download('00000000-0000-4000-8000-000000014001','document_link',
 '00000000-0000-4000-8000-000000014301','00000000-0000-4000-8000-000000014101')$$,'Verified application download is logged');
select throws_ok($$select log_privacy_download('00000000-0000-4000-8000-000000014001','document_link',
 '00000000-0000-4000-8000-000000014301','00000000-0000-4000-8000-000000014102')$$,'42501',null,'Cross-tenant download cannot be logged as authorised');

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000014102';
select is((select count(*) from privacy_people('00000000-0000-4000-8000-000000014001')),0::bigint,'Foreign owner cannot list people');
select is((select count(*) from privacy_recent_access('00000000-0000-4000-8000-000000014001')),0::bigint,'Foreign owner cannot read access log');
select throws_ok($$select export_privacy_person('00000000-0000-4000-8000-000000014001','worker','00000000-0000-4000-8000-000000014201','json')$$,
 '42501',null,'Foreign owner cannot export a person');
select throws_ok($$select erase_privacy_person('00000000-0000-4000-8000-000000014001','worker','00000000-0000-4000-8000-000000014201','ERASE')$$,
 '42501',null,'Foreign owner cannot erase a person');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000014101';
select ok((select valid from verify_chain('00000000-0000-4000-8000-000000014001')), 'Chain verifies before erasure');
select ok((select d#>>'{person,reference}' = 'ERASURE-REFERENCE' and d#>>'{certificates_of_sponsorship,0,reference}' = 'ERASURE-COS'
 and d#>>'{documents,0,id}' = '00000000-0000-4000-8000-000000014301'
 and jsonb_array_length(d->'right_to_work_checks') = 1
 from export_privacy_person('00000000-0000-4000-8000-000000014001','worker','00000000-0000-4000-8000-000000014201','json') d),
 'Export includes the person, the right-to-work check, certificate and document');
select throws_ok($$select erase_privacy_person('00000000-0000-4000-8000-000000014001','worker','00000000-0000-4000-8000-000000014201','no')$$,
 '22023',null,'Erasure requires explicit confirmation');
select lives_ok($$select set_privacy_person('00000000-0000-4000-8000-000000014001','worker','00000000-0000-4000-8000-000000014201',null,true)$$,'Owner can place erasure on hold');
select ok(not erase_privacy_person('00000000-0000-4000-8000-000000014001','worker','00000000-0000-4000-8000-000000014201','ERASE'),'Hold prevents manual erasure');
select lives_ok($$select set_privacy_person('00000000-0000-4000-8000-000000014001','worker','00000000-0000-4000-8000-000000014201',null,false)$$,'Owner can release the hold');
select ok(erase_privacy_person('00000000-0000-4000-8000-000000014001','worker','00000000-0000-4000-8000-000000014201','ERASE'),'Owner can erase the person');
select is(export_privacy_person('00000000-0000-4000-8000-000000014001','worker','00000000-0000-4000-8000-000000014201','pdf'),
 null::jsonb,'Erased person cannot be exported');
select is((select count(*) from sponsored_workers),0::bigint,'Worker name and reference are erased');
select is((select count(*) from rtw_checks),0::bigint,'Linked RTW record is erased');
select is((select count(*) from cos_records),0::bigint,'Linked sponsorship certificate is erased');
select is((select count(*) from documents),0::bigint,'Document metadata is erased');
select is((select count(*) from document_notifications),0::bigint,'Linked reminders are erased');
select is((select status from audit_pack_jobs),'failed','Previous audit packs are invalidated');
select is(privacy_pending_storage('00000000-0000-4000-8000-000000014001'),2::bigint,'Vault and historical archive files are queued atomically');
select ok((select valid and checked_entries = 5 from verify_chain('00000000-0000-4000-8000-000000014001')),
 'Original entries plus deletion events verify after erasure');
select is((select string_agg(encode(entry_hash,'hex'),'' order by sequence) from ledger_entries where sequence <= 3),
 :'original_hashes','Erasure does not rewrite previous hashes');
select ok(not exists (select 1 from ledger_entries where metadata::text ~* 'canary|ERASURE-REFERENCE|ERASURE-COS'),
 'Ledger payloads exclude erased names and references');
select ok(exists (select 1 from privacy_recent_access('00000000-0000-4000-8000-000000014001') where action = 'manual_erasure')
 and exists (select 1 from privacy_recent_access('00000000-0000-4000-8000-000000014001') where action = 'document_link'),
 'Privacy log includes erasure and access events');

select lives_ok($$select set_privacy_retention('00000000-0000-4000-8000-000000014001','individual','2026-01-01',10,'Synthetic approved policy')$$,
 'Owner can append a retention rule');
select lives_ok($$select set_privacy_retention('00000000-0000-4000-8000-000000014001','individual','2026-02-01',20,'Synthetic new version')$$,
 'Owner can version the schedule');
select lives_ok($$select set_privacy_person('00000000-0000-4000-8000-000000014001','individual','00000000-0000-4000-8000-000000014203','2026-02-01',false)$$,
 'Owner records the retention start date');
select throws_ok($$select purge_privacy_due('2026-02-21')$$,'42501',null,'Users cannot control the scheduler clock through the API');

set local role service_role;
select is(purge_privacy_due('2026-02-20'),0,'Effective rule prevents premature deletion');
select is(purge_privacy_due('2026-02-21'),1,'Scheduled purge erases records on the boundary');
select is(purge_privacy_due('2026-02-21'),0,'Re-running purge is idempotent');
select is(open_passport_share(repeat('e',64),null,0)->>'status','unavailable','Links selecting an erased person are revoked');
select is((select count(*) from claim_privacy_storage()),3::bigint,'Worker claims vault, invalidated archive and late orphan');
select is((select count(*) from claim_privacy_storage()),0::bigint,'Leased cleanup paths are not double-claimed');
reset role;
select ok(not exists (select 1 from engaged_individuals where reference = 'DUE-REFERENCE'),'Scheduled erasure removes responsibility details');
select is((select status from audit_pack_jobs where id = '00000000-0000-4000-8000-000000014402'),'ready','Other tenant archive is untouched');

set local role authenticated;
select ok(erase_privacy_person('00000000-0000-4000-8000-000000014001','personnel','00000000-0000-4000-8000-000000014204','ERASE'),'Key personnel can be erased');
select is((select count(*) from personnel_handover_tasks),0::bigint,'Personnel erasure removes handover tasks');
select ok((select valid from verify_chain('00000000-0000-4000-8000-000000014001')),'Chain verifies after each category of erasure');
reset role;
select * from finish();
rollback;
