begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
set local search_path = public, extensions;
-- Exercise the policy even on Storage versions with the additional SQL-delete guard.
set local storage.allow_delete_query = 'true';

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000005101'), ('00000000-0000-4000-8000-000000005102'),
  ('00000000-0000-4000-8000-000000005103');
insert into organisations (id, name) values
  ('00000000-0000-4000-8000-000000005001', 'Synthetic Vault A'),
  ('00000000-0000-4000-8000-000000005002', 'Synthetic Vault B');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000005001', '00000000-0000-4000-8000-000000005002');
insert into memberships values
  ('00000000-0000-4000-8000-000000005001', '00000000-0000-4000-8000-000000005101', 'owner'),
  ('00000000-0000-4000-8000-000000005001', '00000000-0000-4000-8000-000000005102', 'viewer'),
  ('00000000-0000-4000-8000-000000005002', '00000000-0000-4000-8000-000000005103', 'admin');

insert into sponsored_workers (id, organisation_id, full_name, reference, status) values
  ('00000000-0000-4000-8000-000000005201', '00000000-0000-4000-8000-000000005001', 'Synthetic A', 'SW-1', 'active'),
  ('00000000-0000-4000-8000-000000005202', '00000000-0000-4000-8000-000000005002', 'Synthetic B', 'SW-2', 'active');
insert into engaged_individuals (id, organisation_id, full_name, reference, engagement_type) values
  ('00000000-0000-4000-8000-000000005203', '00000000-0000-4000-8000-000000005002', 'Synthetic C', 'EI-1', 'contractor');

insert into documents
  (id, organisation_id, sponsored_worker_id, document_type, issued_on, expires_on, content_type, size_bytes, scan_status, state)
values
  ('00000000-0000-4000-8000-000000005301', '00000000-0000-4000-8000-000000005001', '00000000-0000-4000-8000-000000005201',
    'identity', '2030-01-01', '2030-06-30', 'application/pdf', 10, 'not_scanned', 'ready'),
  ('00000000-0000-4000-8000-000000005302', '00000000-0000-4000-8000-000000005002', '00000000-0000-4000-8000-000000005202',
    'identity', '2030-01-01', null, 'application/pdf', 10, 'clean', 'ready'),
  ('00000000-0000-4000-8000-000000005303', '00000000-0000-4000-8000-000000005001', '00000000-0000-4000-8000-000000005201',
    'identity', '2030-01-01', '2030-06-30', 'application/pdf', 10, 'not_scanned', 'pending');

insert into storage.objects (bucket_id, name)
select 'sponsorguard-documents', object_path from documents;
insert into storage.objects (bucket_id, name) values
  ('sponsorguard-documents', '00000000-0000-4000-8000-000000005001/unregistered');

-- Simulate broad future Storage grants and exercise the vault's restrictions.
create policy vault_test_permissive on storage.objects for all to authenticated, anon
  using (true) with check (true);

select plan(35);
select is((select public from storage.buckets where id = 'sponsorguard-documents'), false, 'Bucket is private');
select is((select file_size_limit from storage.buckets where id = 'sponsorguard-documents'), 5242880::bigint, 'Bucket enforces 5 MiB');
select is((select allowed_mime_types from storage.buckets where id = 'sponsorguard-documents'),
  array['application/pdf', 'image/jpeg', 'image/png'], 'Bucket limits MIME types');
select throws_ok($$insert into documents
  (organisation_id, engaged_individual_id, document_type, content_type, size_bytes, scan_status)
  values ('00000000-0000-4000-8000-000000005001', '00000000-0000-4000-8000-000000005203', 'identity', 'application/pdf', 1, 'clean')$$,
  '23503', null, 'Document cannot link to a person in another organisation');

set local role service_role;
select is(queue_document_expiry_notifications('2030-03-31'), 0::bigint, 'No reminder before 90 days');
select is(queue_document_expiry_notifications('2030-04-01'), 1::bigint, '90-day reminder is created');
select is(queue_document_expiry_notifications('2030-04-01'), 0::bigint, 'Re-running the queue creates no duplicates');
select is(queue_document_expiry_notifications('2030-05-31'), 1::bigint, '30-day reminder is created');
select is(queue_document_expiry_notifications('2030-06-23'), 1::bigint, '7-day reminder is created');
select is(queue_document_expiry_notifications('2030-07-01'), 0::bigint, 'No new reminders after expiry');
select is((select array_agg(remind_on order by remind_on) from document_notifications),
  array['2030-04-01'::date, '2030-05-31'::date, '2030-06-23'::date], 'Only the ready dated document gets three reminders');
reset role;

insert into document_notifications (organisation_id, document_id, days_before, remind_on)
values ('00000000-0000-4000-8000-000000005002', '00000000-0000-4000-8000-000000005302', 7, '2030-06-23');

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000005101';
select is((select count(*) from documents), 1::bigint, 'Owner sees only their ready document');
select is((select count(*) from document_notifications), 3::bigint, 'Owner sees only their organisation’s notifications');
select is((select count(*) from storage.objects where bucket_id = 'sponsorguard-documents'), 1::bigint,
  'Owner sees only the authorised object even with a broad permissive policy');
select is((select count(*) from storage.objects where name =
  '00000000-0000-4000-8000-000000005002/00000000-0000-4000-8000-000000005302'), 0::bigint,
  'A direct lookup of the foreign object is denied');
select is((select count(*) from storage.objects where name =
  '00000000-0000-4000-8000-000000005001/00000000-0000-4000-8000-000000005303'), 0::bigint,
  'A pending object cannot be signed');
select is((select count(*) from storage.objects where name =
  '00000000-0000-4000-8000-000000005001/unregistered'), 0::bigint,
  'The organisation folder alone cannot authorise object reads');
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('sponsorguard-documents', '00000000-0000-4000-8000-000000005002/foreign-write')$$,
  '42501', null, 'Owner cannot upload directly to another organisation');
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('sponsorguard-documents', '00000000-0000-4000-8000-000000005001/own-write')$$,
  '42501', null, 'Only the validated server pipeline can upload');
with changed as (update storage.objects set name = 'replaced' where bucket_id = 'sponsorguard-documents' returning id)
select is((select count(*) from changed), 0::bigint, 'Owner cannot overwrite vault objects');
with changed as (delete from storage.objects where bucket_id = 'sponsorguard-documents' returning id)
select is((select count(*) from changed), 0::bigint, 'Owner cannot delete vault objects');
select throws_ok($$update documents set state = 'ready'$$, '42501', null, 'Owner cannot bypass finalisation');
select throws_ok($$select queue_document_expiry_notifications('2030-06-23')$$,
  '42501', null, 'Clients cannot run the global reminder job');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000005102';
select is((select count(*) from documents), 1::bigint, 'Viewer can see their organisation’s metadata');
select is((select count(*) from storage.objects where bucket_id = 'sponsorguard-documents'), 1::bigint, 'Viewer can download their organisation’s object');
select is((select count(*) from storage.objects where name =
  '00000000-0000-4000-8000-000000005002/00000000-0000-4000-8000-000000005302'), 0::bigint, 'Viewer cannot access a foreign object');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000005103';
select is((select count(*) from documents), 1::bigint, 'Second tenant sees its own metadata');
select is((select count(*) from document_notifications), 1::bigint, 'Second tenant sees its own notifications');
select is((select count(*) from storage.objects where bucket_id = 'sponsorguard-documents'), 1::bigint, 'Second tenant sees its own object');
select is((select count(*) from storage.objects where name =
  '00000000-0000-4000-8000-000000005001/00000000-0000-4000-8000-000000005301'), 0::bigint, 'Second tenant cannot access the first tenant’s object');

set local request.jwt.claims = '{"aal":"aal1"}';
select is((select count(*) from documents), 0::bigint, 'AAL1 cannot read document metadata');
select is((select count(*) from storage.objects where bucket_id = 'sponsorguard-documents'), 0::bigint, 'AAL1 cannot sign or read objects');
select is((select count(*) from document_notifications), 0::bigint, 'AAL1 cannot read notifications');
reset role;
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'sponsorguard-documents'), 0::bigint, 'Anonymous read is blocked even with permissive policy');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('sponsorguard-documents', 'anon-write')$$,
  '42501', null, 'Anonymous upload is blocked');

reset role;
select * from finish();
rollback;
