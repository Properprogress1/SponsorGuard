begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
set local search_path = public, extensions;
select plan(29);

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000007101'), ('00000000-0000-4000-8000-000000007102');
insert into organisations (id, name) values
  ('00000000-0000-4000-8000-000000007001', 'Synthetic Share A'),
  ('00000000-0000-4000-8000-000000007002', 'Synthetic Share B');
update organisation_billing set plan = 'pro' where organisation_id in ('00000000-0000-4000-8000-000000007001', '00000000-0000-4000-8000-000000007002');
insert into memberships values
  ('00000000-0000-4000-8000-000000007001', '00000000-0000-4000-8000-000000007101', 'owner'),
  ('00000000-0000-4000-8000-000000007002', '00000000-0000-4000-8000-000000007102', 'owner');
insert into sponsored_workers (id, organisation_id, full_name, reference, status) values
  ('00000000-0000-4000-8000-000000007201', '00000000-0000-4000-8000-000000007001', 'Private Canary One', 'PERSON-1', 'active'),
  ('00000000-0000-4000-8000-000000007202', '00000000-0000-4000-8000-000000007001', 'Private Canary Two', 'PERSON-2', 'active'),
  ('00000000-0000-4000-8000-000000007203', '00000000-0000-4000-8000-000000007002', 'Private Canary Three', 'PERSON-3', 'active');
insert into rtw_checks (id, organisation_id, sponsored_worker_id, checked_on, method) values
  ('00000000-0000-4000-8000-000000007301', '00000000-0000-4000-8000-000000007001',
    '00000000-0000-4000-8000-000000007201', '2026-07-10', 'manual'),
  ('00000000-0000-4000-8000-000000007302', '00000000-0000-4000-8000-000000007001',
    '00000000-0000-4000-8000-000000007202', '2026-07-10', 'manual'),
  ('00000000-0000-4000-8000-000000007303', '00000000-0000-4000-8000-000000007002',
    '00000000-0000-4000-8000-000000007203', '2026-07-10', 'manual');
update rtw_checks set sponsored_worker_id = '00000000-0000-4000-8000-000000007202'
  where id = '00000000-0000-4000-8000-000000007301';
insert into key_personnel (organisation_id, full_name, role)
values ('00000000-0000-4000-8000-000000007001', 'Private Canary Personnel', 'Level 1 user');
select is((select count(*) from ledger_entry_people), 4::bigint, 'Each captured RTW event has one historical association');

-- Supply known instants to test the London-date boundary independently of test execution time.
alter table ledger_entries disable trigger ledger_append_only;
update ledger_entries set created_at = case when sequence = 1 then timestamptz '2026-07-01 23:00:00+00'
  else timestamptz '2026-07-02 23:00:00+00' end;
alter table ledger_entries enable trigger ledger_append_only;

insert into passport_shares (id, organisation_id, token_hash, passcode_hash, scope, expires_at) values
  ('00000000-0000-4000-8000-000000007401', '00000000-0000-4000-8000-000000007001',
    decode(repeat('a',64),'hex'), null, 'all', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000007402', '00000000-0000-4000-8000-000000007001',
    decode(repeat('b',64),'hex'), null, 'all', now() - interval '1 second'),
  ('00000000-0000-4000-8000-000000007403', '00000000-0000-4000-8000-000000007001',
    decode(repeat('c',64),'hex'), decode(repeat('1',64),'hex'), 'all', now() + interval '1 day');

set local role service_role;
select lives_ok($$select issue_passport_share('00000000-0000-4000-8000-000000007001',
  '00000000-0000-4000-8000-000000007101', repeat('d',64), null, 'people', current_date + 2,
  array['00000000-0000-4000-8000-000000007201'::uuid], '{}', null, null)$$, 'Manager can issue a person share');
select lives_ok($$select issue_passport_share('00000000-0000-4000-8000-000000007001',
  '00000000-0000-4000-8000-000000007101', repeat('e',64), null, 'dates', current_date + 2,
  '{}', '{}', '2026-07-02', '2026-07-02')$$, 'Manager can issue a date share');
select throws_ok($$select issue_passport_share('00000000-0000-4000-8000-000000007001',
  '00000000-0000-4000-8000-000000007101', repeat('2',64), null, 'people', current_date + 2,
  array['00000000-0000-4000-8000-000000007203'::uuid], '{}', null, null)$$, '22023', null,
  'A foreign person cannot be included in a share');
select throws_ok($$select issue_passport_share('00000000-0000-4000-8000-000000007001',
  '00000000-0000-4000-8000-000000007102', repeat('2',64), null, 'all', current_date + 2,
  '{}', '{}', null, null)$$, '42501', null, 'A foreign actor cannot issue a link');
select is(jsonb_array_length(open_passport_share(repeat('a',64),null,0)->'entries'), 4, 'All scope still excludes foreign entries');
select is(jsonb_array_length(open_passport_share(repeat('d',64),null,0)->'entries'), 1, 'Selected person sees one historical entry');
select is(open_passport_share(repeat('d',64),null,0)#>>'{entries,0,operation}', 'created', 'Reassociation does not expose the later update');
select is(jsonb_array_length(open_passport_share(repeat('e',64),null,0)->'entries'), 1, 'Date range includes the London start and excludes the next midnight');
select ok(not ((open_passport_share(repeat('a',64),null,0)#>'{entries,0}') ?| array['metadata','record_id','organisation_id','sequence','entry_hash']),
  'Public response omits private ledger fields');
select is(open_passport_share(repeat('b',64),null,0)->>'status', 'unavailable', 'Expired link fails');
select is(open_passport_share(repeat('0',64),null,0)->>'status', 'unavailable', 'Unknown token fails');
select is(open_passport_share(repeat('c',64),null,0)->>'status', 'passcode', 'Protected link requires a passcode');
select is(open_passport_share(repeat('c',64),'wrong',0)->>'status', 'incorrect', 'First wrong guess fails');
select is(open_passport_share(repeat('c',64),'wrong',0)->>'status', 'incorrect', 'Second wrong guess fails');
select is(open_passport_share(repeat('c',64),'wrong',0)->>'status', 'incorrect', 'Third wrong guess fails');
select is(open_passport_share(repeat('c',64),'wrong',0)->>'status', 'incorrect', 'Fourth wrong guess fails');
select is(open_passport_share(repeat('c',64),'wrong',0)->>'status', 'locked', 'Fifth wrong guess locks link');
select is(open_passport_share(repeat('c',64),repeat('1',64),0)->>'status', 'locked', 'A correct passcode cannot bypass cooldown');
select is(probe_passport_share(repeat('c',64)), 'locked', 'Preflight also denies a locked link');

reset role;
select is((select count(*) from passport_share_access where share_id = '00000000-0000-4000-8000-000000007403'),
  5::bigint, 'The log records guesses and the lock without recording blocked retries');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
  where table_schema = 'public' and table_name = 'passport_share_access'),
  array['id','organisation_id','share_id','accessed_at','outcome'], 'Access log stores no viewer identifiers');
update passport_shares set last_failed_at = now() - interval '16 minutes'
  where id = '00000000-0000-4000-8000-000000007403';
set local role service_role;
select is(open_passport_share(repeat('c',64),repeat('1',64),0)->>'status', 'open', 'Correct passcode works after cooldown');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000007102';
select throws_ok($$select revoke_passport_share('00000000-0000-4000-8000-000000007001',
  '00000000-0000-4000-8000-000000007401')$$, '42501', null, 'Foreign manager cannot revoke');
select is((select count(id) from passport_shares), 0::bigint, 'Foreign manager cannot list share links');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000007101';
select ok(revoke_passport_share('00000000-0000-4000-8000-000000007001', '00000000-0000-4000-8000-000000007401'), 'Manager can revoke');
select throws_ok($$select token_hash from passport_shares$$, '42501', null, 'Managers cannot read stored verifiers');
reset role;
set local role anon;
select throws_ok($$select open_passport_share(repeat('a',64),null,0)$$, '42501', null, 'Public callers cannot use the digest-taking RPC');
reset role;
set local role service_role;
select is(open_passport_share(repeat('a',64),null,0)->>'status','unavailable','Revocation takes effect on the next open');

reset role;
select * from finish();
rollback;
