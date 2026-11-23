begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;
set search_path = public, extensions;
select plan(11);

set local role anon;
select throws_ok(
  $$ select public.consume_security_rate('auth_sign_up', repeat('a', 64), null) $$,
  '42501', null, 'anon cannot consume the service rate limit directly'
);
reset role;
set local role authenticated;
select throws_ok(
  $$ select * from public.security_rate_buckets $$,
  '42501', null, 'authenticated cannot inspect rate limit buckets'
);
select throws_ok(
  $$ select public.purge_security_rate_buckets() $$,
  '42501', null, 'authenticated cannot purge rate limit buckets'
);
reset role;

set local role service_role;
select ok((
  select bool_and(public.consume_security_rate('auth_sign_up', repeat('a',64), repeat('b',64)))
  from generate_series(1,5)
), 'the first five sign-up attempts for a subject are allowed');
select ok(not public.consume_security_rate('auth_sign_up', repeat('c',64), repeat('b',64)),
  'the subject budget is shared across networks');
select ok((
  select bool_and(public.consume_security_rate('auth_sign_up', repeat('d',64), md5(i::text) || md5(i::text)))
  from generate_series(1,40) i
), 'one network can consume its budget across different subjects');
select ok(not public.consume_security_rate('auth_sign_up', repeat('d',64), repeat('e',64)),
  'changing the subject does not bypass the network budget');
select ok(public.consume_security_rate('passport_read', repeat('d',64), repeat('b',64)),
  'Passport reads have a separate budget');
reset role;

select is((
  select count(*) from public.security_rate_buckets
  where scope = 'auth_sign_up:subject' and key_hash = repeat('e',64)
), 0::bigint, 'a blocked network cannot allocate new subject buckets');

update public.security_rate_buckets set window_until = now() - interval '1 minute';
set local role service_role;
select lives_ok('select public.purge_security_rate_buckets()', 'service role can purge expired buckets');
select ok(public.consume_security_rate('auth_sign_up', repeat('a',64), repeat('b',64)),
  'expired limits allow a fresh attempt');
reset role;

select * from finish();
rollback;
