begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, service_role;
set local search_path = public, extensions;
select plan(25);

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000006101'), ('00000000-0000-4000-8000-000000006102');
insert into organisations (id, name) values
  ('00000000-0000-4000-8000-000000006001', 'Synthetic A'),
  ('00000000-0000-4000-8000-000000006002', 'Synthetic B');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000006001', '00000000-0000-4000-8000-000000006002');
insert into memberships values
  ('00000000-0000-4000-8000-000000006001', '00000000-0000-4000-8000-000000006101', 'owner'),
  ('00000000-0000-4000-8000-000000006002', '00000000-0000-4000-8000-000000006102', 'viewer');
insert into sponsored_workers (id, organisation_id, full_name, reference, status) values
  ('00000000-0000-4000-8000-000000006201', '00000000-0000-4000-8000-000000006001', 'Synthetic Person Canary', 'CANARY-PASSPORT-93', 'active');

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000006101';
select is((select checked_entries from verify_chain('00000000-0000-4000-8000-000000006001')), 0::bigint, 'An empty organisation has zero entries');
insert into rtw_checks (organisation_id, sponsored_worker_id, checked_on, method)
values ('00000000-0000-4000-8000-000000006001', '00000000-0000-4000-8000-000000006201', '2026-07-10', 'online');
update rtw_checks set method = 'manual';
update rtw_checks set method = 'manual';
select results_eq($$select operation::text from ledger_entries order by sequence$$,
  $$values ('created'), ('updated')$$, 'RTW changes append events, excluding a no-op');
insert into reporting_events (organisation_id, rule_key, event_on)
values ('00000000-0000-4000-8000-000000006001', 'worker_circumstances', '2026-07-10');
select is((select record_type::text from ledger_entries where sequence = 3), 'reporting_events', 'Reporting insert appends');
insert into key_personnel (organisation_id, full_name, role)
values ('00000000-0000-4000-8000-000000006001', 'Synthetic Personnel Canary', 'Authorising Officer');
update key_personnel set role = 'Key Contact';
delete from key_personnel;
select results_eq($$select operation::text from ledger_entries where record_type = 'key_personnel' order by sequence$$,
  $$values ('created'), ('updated'), ('deleted')$$, 'Key personnel create, edit and delete append');

reset role;
set local role service_role;
insert into documents (id, organisation_id, sponsored_worker_id, document_type, content_type, size_bytes, scan_status)
values ('00000000-0000-4000-8000-000000006301', '00000000-0000-4000-8000-000000006001',
  '00000000-0000-4000-8000-000000006201', 'identity', 'application/pdf', 10, 'not_scanned');
select is((select count(*) from ledger_entries where record_type = 'documents'), 0::bigint, 'Pending uploads do not append');
update documents set state = 'ready' where id = '00000000-0000-4000-8000-000000006301';
select results_eq($$select operation::text, record_id from ledger_entries where record_type = 'documents'$$,
  $$values ('created', '00000000-0000-4000-8000-000000006301'::uuid)$$, 'Finalising a document records its UUID once');
select throws_ok($$update ledger_entries set created_at = now()$$, '42501', null, 'Service role cannot edit the ledger');

reset role;
insert into key_personnel (organisation_id, full_name, role)
values ('00000000-0000-4000-8000-000000006002', 'Synthetic Second Canary', 'Key Contact');
select throws_ok($$update ledger_entries set created_at = now()$$, '55000', null, 'Update trigger blocks even the table owner');
select throws_ok($$delete from ledger_entries$$, '55000', null, 'Delete trigger blocks even the table owner');
select throws_ok($$truncate ledger_entries, ledger_entry_people$$, '55000', null, 'Truncate trigger protects history');
select is((select count(*) from ledger_entries where to_jsonb(ledger_entries)::text ~* 'canary|full_name|passport|address'),
  0::bigint, 'No personal identifiers leak into ledger rows');
select ok((select bool_and(metadata = jsonb_build_object('operation', operation::text, 'organisation_id', organisation_id,
  'record_type', record_type::text, 'sequence', sequence)) from ledger_entries), 'Every metadata field is allowlisted');
select is((select entry_hash from ledger_entries where organisation_id = '00000000-0000-4000-8000-000000006001' and sequence = 1),
  (select sha256(decode(repeat('00', 32), 'hex') || convert_to(
    '{"operation":"created","organisation_id":"00000000-0000-4000-8000-000000006001","record_type":"rtw_checks","sequence":1}'
      || to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || record_id::text, 'UTF8'))
    from ledger_entries where organisation_id = '00000000-0000-4000-8000-000000006001' and sequence = 1),
  'Genesis uses the documented canonical JSON and SHA-256 bytes');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000006101';
select is((select count(*) from ledger_entries), 7::bigint, 'Members see their organisation only');
select ok((select valid from verify_chain('00000000-0000-4000-8000-000000006001')), 'The intact chain verifies');
select throws_ok($$select * from verify_chain('00000000-0000-4000-8000-000000006002')$$, '42501', null, 'Cross-tenant verification is denied');
select throws_ok($$select sponsor_guard_private.append_ledger_entry('00000000-0000-4000-8000-000000006001',
  '00000000-0000-4000-8000-000000006301', 'documents', 'created')$$, '42501', null, 'Clients cannot append forged events');
select throws_ok($$insert into ledger_entries (organisation_id, sequence) values ('00000000-0000-4000-8000-000000006001', 8)$$,
  '42501', null, 'Clients cannot insert directly');
select throws_ok($$insert into key_personnel (organisation_id, full_name, role)
  values ('00000000-0000-4000-8000-000000006002', 'Rejected Fixture', 'Key Contact')$$, '42501', null, 'Cross-tenant key personnel writes are denied');

set local request.jwt.claims = '{"aal":"aal1"}';
select is((select count(*) from ledger_entries), 0::bigint, 'AAL1 cannot read entries');
select throws_ok($$select * from verify_chain('00000000-0000-4000-8000-000000006001')$$, '42501', null, 'AAL1 cannot verify a chain');

-- Simulate an elevated operator bypassing the trigger in this rolled-back test.
reset role;
alter table ledger_entries disable trigger ledger_append_only;
update ledger_entries set created_at = created_at + interval '1 second'
  where organisation_id = '00000000-0000-4000-8000-000000006001' and sequence = 2;
alter table ledger_entries enable trigger ledger_append_only;
set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
select ok(not (select valid from verify_chain('00000000-0000-4000-8000-000000006001')), 'Tampering breaks verification');
select is((select first_invalid_sequence from verify_chain('00000000-0000-4000-8000-000000006001')), 2::bigint,
  'Verification reports the first changed sequence');
reset role;
alter table ledger_entries disable trigger ledger_append_only;
-- Simulate removal of both the ledger entry and its append-only sharing index.
alter table ledger_entry_people disable trigger ledger_people_append_only;
delete from ledger_entry_people where organisation_id = '00000000-0000-4000-8000-000000006001' and sequence = 2;
alter table ledger_entry_people enable trigger ledger_people_append_only;
delete from ledger_entries where organisation_id = '00000000-0000-4000-8000-000000006001' and sequence = 2;
alter table ledger_entries enable trigger ledger_append_only;
set local role authenticated;
select is((select first_invalid_sequence from verify_chain('00000000-0000-4000-8000-000000006001')), 3::bigint,
  'Verification detects a missing interior entry');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000006102';
select ok((select valid from verify_chain('00000000-0000-4000-8000-000000006002')), 'The other organisation’s chain remains intact');

reset role;
select * from finish();
rollback;
