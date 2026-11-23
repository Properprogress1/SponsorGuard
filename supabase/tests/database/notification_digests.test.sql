begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, service_role;
set local search_path = public, extensions;
select plan(16);

insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-4000-8000-000000010101', 'digest-owner@example.com', now()),
 ('00000000-0000-4000-8000-000000010102', 'digest-viewer@example.com', now()),
 ('00000000-0000-4000-8000-000000010103', 'digest-disabled@example.com', now()),
 ('00000000-0000-4000-8000-000000010104', 'digest-unconfirmed@example.com', null),
 ('00000000-0000-4000-8000-000000010105', 'digest-other@example.com', now()),
 ('00000000-0000-4000-8000-000000010106', 'digest-default@example.com', now());
insert into organisations (id, name) values
 ('00000000-0000-4000-8000-000000010001', 'Synthetic Digest'),
 ('00000000-0000-4000-8000-000000010002', 'Other Synthetic Digest');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010002');
insert into memberships (organisation_id, user_id, role) values
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010101', 'owner'),
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010102', 'viewer'),
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010103', 'admin'),
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010104', 'admin'),
 ('00000000-0000-4000-8000-000000010002', '00000000-0000-4000-8000-000000010105', 'viewer'),
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010106', 'owner');
insert into notification_preferences (user_id, unsubscribe_id, enabled, tasks, documents, rtw, personnel) values
 ('00000000-0000-4000-8000-000000010101', '00000000-0000-4000-8000-000000010201', true, true, true, true, true),
 ('00000000-0000-4000-8000-000000010102', '00000000-0000-4000-8000-000000010202', true, false, false, true, true),
 ('00000000-0000-4000-8000-000000010103', '00000000-0000-4000-8000-000000010203', false, true, true, true, true),
 ('00000000-0000-4000-8000-000000010104', '00000000-0000-4000-8000-000000010204', true, true, true, true, true),
 ('00000000-0000-4000-8000-000000010105', '00000000-0000-4000-8000-000000010205', true, true, true, true, true);

insert into personnel_inactivity_rules values ('2026-11-01', 10, 'Synthetic test configuration');
insert into key_personnel (organisation_id, full_name, role, leaving, sms_last_login_on) values
 ('00000000-0000-4000-8000-000000010001', 'Synthetic Officer', 'Authorising Officer', false, '2026-11-13'),
 ('00000000-0000-4000-8000-000000010001', 'Synthetic Contact', 'Key Contact', true, '2026-11-01'),
 ('00000000-0000-4000-8000-000000010001', 'Synthetic User', 'Level 1 user', false, '2026-11-14');
insert into reporting_events (organisation_id, rule_key, event_on) values
 ('00000000-0000-4000-8000-000000010001', 'worker_circumstances', '2026-07-10');
insert into sponsored_workers (id, organisation_id, full_name, reference, status) values
 ('00000000-0000-4000-8000-000000010301', '00000000-0000-4000-8000-000000010001', 'Synthetic Worker', 'NOTIF1', 'active'),
 ('00000000-0000-4000-8000-000000010302', '00000000-0000-4000-8000-000000010001', 'Synthetic Other Worker', 'NOTIF2', 'active');
insert into rtw_checks (organisation_id, sponsored_worker_id, checked_on, method, follow_up_on) values
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010301', '2026-11-01', 'manual', '2026-11-23'),
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010302', '2026-11-01', 'manual', '2026-11-23'),
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010302', '2026-11-02', 'manual', null);
insert into documents (organisation_id, sponsored_worker_id, document_type, expires_on, content_type, size_bytes, scan_status, state) values
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010301', 'other', '2026-11-30', 'application/pdf', 10, 'clean', 'ready'),
 ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000010301', 'other', '2026-11-30', 'application/pdf', 10, 'clean', 'pending');

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000010101';
select is((select count(user_id) from notification_preferences), 1::bigint, 'Users see only their own preferences');
select throws_ok($$select unsubscribe_id from notification_preferences$$, '42501', null, 'Unsubscribe identifier is private');
select throws_ok($$select * from claim_notification_digests('2026-11-23', 100)$$, '42501', null, 'Members cannot claim or enumerate recipients');
select lives_ok($$insert into notification_preferences (user_id, enabled) values
 ('00000000-0000-4000-8000-000000010101', true) on conflict (user_id) do update set user_id = excluded.user_id, enabled = excluded.enabled$$, 'Owner can save preferences using upsert');
with changed as (update notification_preferences set enabled = true where user_id = '00000000-0000-4000-8000-000000010103' returning user_id)
select is((select count(*) from changed), 0::bigint, 'Users cannot update another account');
select throws_ok($$update notification_preferences set user_id = '00000000-0000-4000-8000-000000010106'$$,
 '42501', null, 'Upsert permission cannot move preferences to another user');
set local request.jwt.claims = '{"aal":"aal1"}';
select is((select count(user_id) from notification_preferences), 0::bigint, 'Preferences require MFA');

set local role service_role;
select results_eq($$select email, tasks, documents, rtw, personnel from claim_notification_digests('2026-11-23', 100) order by email$$,
 $$values ('digest-owner@example.com', 4::bigint, 1::bigint, 1::bigint, 2::bigint),
          ('digest-viewer@example.com', 0::bigint, 0::bigint, 1::bigint, 0::bigint)$$,
 'Digest respects preferences, verified email, tenant scope, current checks, and manager-only topics');
select is((select count(*) from claim_notification_digests('2026-11-23', 100)), 0::bigint, 'Restarting same-day dispatch has no recipients');
select lives_ok($$select unsubscribe_notification_digests('00000000-0000-4000-8000-000000010202')$$, 'Signed endpoint can opt a user out via its service RPC');
select lives_ok($$select unsubscribe_notification_digests('00000000-0000-4000-8000-000000010202')$$, 'Repeating unsubscribe changes nothing');
select results_eq($$select email, tasks, documents, rtw, personnel from claim_notification_digests('2026-11-24', 100)$$,
 $$values ('digest-owner@example.com', 4::bigint, 0::bigint, 1::bigint, 3::bigint)$$,
 'Next day honours unsubscribe and changed follow-up and continuity thresholds');
reset role;
select ok(not (select enabled from notification_preferences where user_id = '00000000-0000-4000-8000-000000010102'), 'Unsubscribe is persisted');
select is((select count(*) from notification_digest_deliveries where digest_day = '2026-11-23'), 2::bigint, 'There is one durable claim per recipient and date');
select lives_ok($$select finish_notification_digests(array(select id from notification_digest_deliveries where digest_day = '2026-11-23'), false)$$,
 'Uncertain sends can be recorded');
select is((select count(*) from claim_notification_digests('2026-11-23', 100)), 0::bigint, 'Uncertain sends are never replayed');
select * from finish();
rollback;
