begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, service_role;
set local search_path = public, extensions;
select plan(19);
insert into auth.users (id) values
 ('00000000-0000-4000-8000-000000011101'), ('00000000-0000-4000-8000-000000011102'),
 ('00000000-0000-4000-8000-000000011103');
insert into organisations (id, name) values
 ('00000000-0000-4000-8000-000000011001', 'Synthetic Pack A'),
 ('00000000-0000-4000-8000-000000011002', 'Synthetic Pack B');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000011001', '00000000-0000-4000-8000-000000011002');
insert into memberships (organisation_id, user_id, role) values
 ('00000000-0000-4000-8000-000000011001', '00000000-0000-4000-8000-000000011101', 'owner'),
 ('00000000-0000-4000-8000-000000011002', '00000000-0000-4000-8000-000000011102', 'admin'),
 ('00000000-0000-4000-8000-000000011001', '00000000-0000-4000-8000-000000011103', 'viewer');
insert into sponsored_workers (organisation_id, id, full_name, reference, status) values
 ('00000000-0000-4000-8000-000000011001', '00000000-0000-4000-8000-000000011201', 'Synthetic Local Person', 'LOCAL', 'active'),
 ('00000000-0000-4000-8000-000000011002', '00000000-0000-4000-8000-000000011202', 'Synthetic Foreign Person', 'FOREIGN', 'active');
insert into rtw_checks (organisation_id, sponsored_worker_id, checked_on, method) values
 ('00000000-0000-4000-8000-000000011001', '00000000-0000-4000-8000-000000011201', '2026-07-01', 'manual');
insert into key_personnel (organisation_id, full_name, role) values
 ('00000000-0000-4000-8000-000000011001', 'Synthetic Leader', 'Key Contact');
insert into reporting_events (organisation_id, rule_key, event_on) values
 ('00000000-0000-4000-8000-000000011001', 'worker_circumstances', '2026-07-10');
insert into documents (organisation_id, sponsored_worker_id, document_type, content_type, size_bytes, scan_status, state) values
 ('00000000-0000-4000-8000-000000011001', '00000000-0000-4000-8000-000000011201', 'other', 'application/pdf', 20, 'not_scanned', 'ready'),
 ('00000000-0000-4000-8000-000000011001', '00000000-0000-4000-8000-000000011201', 'other', 'application/pdf', 20, 'not_scanned', 'pending'),
 ('00000000-0000-4000-8000-000000011002', '00000000-0000-4000-8000-000000011202', 'other', 'application/pdf', 20, 'not_scanned', 'ready');

select ok(not (select public from storage.buckets where id = 'sponsorguard-audit-packs'), 'Archive bucket is private');
insert into storage.objects (bucket_id, name) values ('sponsorguard-audit-packs', '00000000-0000-4000-8000-000000011001/example.zip');
set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000011101';
select is((select count(*) from storage.objects where bucket_id = 'sponsorguard-audit-packs'), 0::bigint, 'Even owners use the authorised download route');
select lives_ok($$select save_audit_pack_checklist('00000000-0000-4000-8000-000000011001', array['One', 'Two'])$$, 'Manager can set ordered checklist');
select throws_ok($$select save_audit_pack_checklist('00000000-0000-4000-8000-000000011002', array['Rejected'])$$, '42501', null, 'Foreign checklist cannot be updated');
select ok(queue_audit_pack('00000000-0000-4000-8000-000000011001') is not null, 'Manager can queue a pack');
select is(queue_audit_pack('00000000-0000-4000-8000-000000011001'), null::uuid, 'Duplicate queue request does not create another job');
select lives_ok($$select save_audit_pack_checklist('00000000-0000-4000-8000-000000011001', array['Changed'])$$, 'Checklist can change after queueing');
select throws_ok($$select claim_audit_pack()$$, '42501', null, 'Authenticated users cannot claim jobs as the worker');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000011102';
select is((select count(id) from audit_pack_jobs), 0::bigint, 'Other tenant manager cannot read the owner’s pack');
select throws_ok($$select queue_audit_pack('00000000-0000-4000-8000-000000011001')$$, '42501', null, 'Other tenant manager cannot queue a pack');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000011103';
select is((select count(id) from audit_pack_jobs), 0::bigint, 'Viewer cannot read audit packs containing personnel records');
set local request.jwt.claims = '{"aal":"aal1"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000011101';
select is((select count(id) from audit_pack_jobs), 0::bigint, 'Audit pack reads require MFA');

set local role service_role;
select id as pack_job, attempt as pack_attempt from claim_audit_pack() \gset
select is((select count(*) from claim_audit_pack()), 0::bigint, 'A live lease prevents duplicate processing');
select is(audit_pack_snapshot(:'pack_job', gen_random_uuid()), null::jsonb, 'A stale attempt cannot read a snapshot');
select is(audit_pack_snapshot(:'pack_job', :'pack_attempt')->'checklist', '["One","Two"]'::jsonb, 'Snapshot retains checklist order at request time');
select ok((
  select snap->>'name' = 'Synthetic Pack A'
    and jsonb_array_length(snap->'workers') = 1 and snap#>>'{workers,0,reference}' = 'LOCAL'
    and jsonb_array_length(snap->'checks') = 1 and jsonb_array_length(snap->'reporting') = 1
    and jsonb_array_length(snap->'personnel') = 1 and jsonb_array_length(snap->'documents') = 1
    and snap#>>'{ledger,valid}' = 'true' and snap#>>'{ledger,checked_entries}' = '4'
  from audit_pack_snapshot(:'pack_job', :'pack_attempt') snap
), 'Snapshot includes all sections, ready local documents, and a verified ledger');
select ok(not finish_audit_pack(:'pack_job', gen_random_uuid(), now(), null), 'A stale attempt cannot publish the pack');
select ok(finish_audit_pack(:'pack_job', :'pack_attempt', now(), null), 'Current lease publishes the pack');
select is(audit_pack_snapshot(:'pack_job', :'pack_attempt'), null::jsonb, 'Snapshot access closes after publication');
reset role;
select * from finish();
rollback;
