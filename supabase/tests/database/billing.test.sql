begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, service_role;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id) values ('00000000-0000-4000-8000-000000012101');
insert into organisations (id,name) values
  ('00000000-0000-4000-8000-000000012001','Synthetic Free'),
  ('00000000-0000-4000-8000-000000012002','Synthetic Core'),
  ('00000000-0000-4000-8000-000000012003','Synthetic Pro');
insert into memberships (organisation_id,user_id,role)
select id,'00000000-0000-4000-8000-000000012101','owner' from organisations
where id in ('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012003');

set local role service_role;
select is(bind_stripe_customer('00000000-0000-4000-8000-000000012002','cus_CoreFixture'), 'cus_CoreFixture', 'Tenant binds a unique Stripe customer');
select is(bind_stripe_customer('00000000-0000-4000-8000-000000012002','cus_OtherFixture'), 'cus_CoreFixture', 'Customer binding cannot be overwritten');
select is(bind_stripe_customer('00000000-0000-4000-8000-000000012003','cus_ProFixture'), 'cus_ProFixture', 'Pro tenant has its own Stripe customer');
select throws_ok($$select bind_stripe_customer('00000000-0000-4000-8000-000000012001','cus_CoreFixture')$$,
 '23505', null, 'Stripe customer cannot claim another tenant');
select attempt as reservation from reserve_stripe_checkout('00000000-0000-4000-8000-000000012002','price_fixture') \gset
select is((select attempt from reserve_stripe_checkout('00000000-0000-4000-8000-000000012002','price_fixture')),
 :'reservation'::uuid, 'Same selection resumes identical checkout');
select is((select count(*) from reserve_stripe_checkout('00000000-0000-4000-8000-000000012002','price_other')),
 0::bigint, 'A different plan cannot open a simultaneous checkout');

select begin_stripe_observation('evt_CoreActive','cus_CoreFixture') as core_revision \gset
select throws_ok($$select begin_stripe_observation('evt_CoreOther','cus_CoreFixture')$$,
 '55P03', null, 'Concurrent Stripe events for the same customer are retried');
select ok(apply_stripe_observation('evt_CoreActive','cus_CoreFixture','sub_CoreFixture',:'core_revision'::bigint,'core','active'), 'Active Core subscription grants plan');
select ok(not apply_stripe_observation('evt_CoreActive','cus_CoreFixture','sub_CoreFixture',:'core_revision'::bigint,'pro','active'), 'Replayed event cannot change the tier');
select release_stripe_observation('cus_CoreFixture',:'core_revision'::bigint) \gset
select is(begin_stripe_observation('evt_CoreActive','cus_CoreFixture'),null::bigint,'Processed event needs no new provider request');
select is((select count(*) from reserve_stripe_checkout('00000000-0000-4000-8000-000000012002','price_fixture')),
 0::bigint,'Active subscriptions use the portal');

select begin_stripe_observation('evt_ProActive','cus_ProFixture') as pro_revision \gset
select ok(apply_stripe_observation('evt_ProActive','cus_ProFixture','sub_ProFixture',:'pro_revision'::bigint,'pro','trialing'), 'Pro entitlement grants trialling subscriptions');
select release_stripe_observation('cus_ProFixture',:'pro_revision'::bigint) \gset
select throws_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status) values
 ('00000000-0000-4000-8000-000000012001','Synthetic Worker','Service','active')$$,'P3001',null,'Worker cap is enforced even on privileged imports');

set local role authenticated;
set local request.jwt.claims = '{"aal":"aal2"}';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000012101';
select is((select worker_limit from workspace_billing('00000000-0000-4000-8000-000000012001')), 0, 'New workspace starts on Free');
select lives_ok($$select save_health_checklist('00000000-0000-4000-8000-000000012001',array['worker_register'])$$, 'Free team can save its health checklist');
select throws_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status)
 values ('00000000-0000-4000-8000-000000012001','Synthetic Worker','Free','active')$$,'42501',null,'Free cannot insert from API');
select throws_ok($$select verify_chain('00000000-0000-4000-8000-000000012001')$$,'42501',null,'Free cannot invoke ledger verification');
select throws_ok($$select queue_audit_pack('00000000-0000-4000-8000-000000012001')$$,'42501',null,'Free cannot queue an audit pack');
select throws_ok($$select bind_stripe_customer('00000000-0000-4000-8000-000000012001','cus_Impostor')$$,
 '42501',null,'Authenticated clients cannot provision Stripe metadata');
select throws_ok($$select apply_stripe_observation('evt_Impostor','cus_CoreFixture','sub_CoreFixture',100,'pro','active')$$,'42501',null,'Authenticated clients cannot upgrade their plan');
select throws_ok($$insert into engaged_individuals (organisation_id,full_name,reference,engagement_type)
 values ('00000000-0000-4000-8000-000000012002','Synthetic Worker','Core engagement','employee')$$,'42501',null,'Core cannot write to extended workforce records');
select throws_ok($$insert into key_personnel (organisation_id,full_name,role)
 values ('00000000-0000-4000-8000-000000012002','Synthetic Person','Key Contact')$$,'42501',null,'Core cannot bypass Continuity Guard gates');

insert into sponsored_workers (organisation_id,full_name,reference,status)
select '00000000-0000-4000-8000-000000012002','Synthetic Worker','Core' || i,'inactive' from generate_series(1,19) i;
select throws_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status)
 select '00000000-0000-4000-8000-000000012002','Synthetic Worker','Core' || i,'active' from generate_series(20,21) i$$,
 'P3001', null, 'Core over-limit bulk API insert is atomic');
select is((select worker_count from workspace_billing('00000000-0000-4000-8000-000000012002')),19,'Failed bulk insert rolls back slots');
select lives_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status)
 values ('00000000-0000-4000-8000-000000012002','Synthetic Worker','Core20','active')$$,'Core permits the twentieth worker');
select throws_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status)
 values ('00000000-0000-4000-8000-000000012002','Synthetic Worker','Core21','active')$$,'P3001',null,'Core blocks the twenty-first worker');

insert into sponsored_workers (organisation_id,full_name,reference,status)
select '00000000-0000-4000-8000-000000012003','Synthetic Worker','Pro' || i,'active' from generate_series(1,60) i;
select is((select worker_count from workspace_billing('00000000-0000-4000-8000-000000012003')),60,'Pro permits sixty workers');
select throws_ok($$insert into sponsored_workers (organisation_id,full_name,reference,status)
 values ('00000000-0000-4000-8000-000000012003','Synthetic Worker','Pro61','active')$$,'P3001',null,'Pro blocks the sixty-first worker');
select lives_ok($$insert into engaged_individuals (organisation_id,full_name,reference,engagement_type)
 values ('00000000-0000-4000-8000-000000012003','Synthetic Person','Pro engagement','employee')$$,'Pro can use the extended workforce map');

set local role service_role;
select throws_ok($$select issue_passport_share('00000000-0000-4000-8000-000000012002',
 '00000000-0000-4000-8000-000000012101',repeat('a',64),null,'all',current_date + 10,'{}','{}',null,null)$$,
 '42501',null,'Service-backed share creation still requires Pro');
select lives_ok($$select issue_passport_share('00000000-0000-4000-8000-000000012003',
 '00000000-0000-4000-8000-000000012101',repeat('b',64),null,'all',current_date + 10,'{}','{}',null,null)$$,
 'Pro can issue Passport links');
select is(open_passport_share(repeat('b',64),null,0)->>'status','open','Pro link is readable');
select begin_stripe_observation('evt_ProCancelled','cus_ProFixture') as cancelled_revision \gset
select ok(apply_stripe_observation('evt_ProCancelled','cus_ProFixture','sub_ProFixture',:'cancelled_revision'::bigint,'pro','canceled'),'Cancellation removes paid access');
select release_stripe_observation('cus_ProFixture',:'cancelled_revision'::bigint) \gset
select is(open_passport_share(repeat('b',64),null,0)->>'status','unavailable','Old public links stop working on downgrade');

set local role authenticated;
select is((select worker_count from workspace_billing('00000000-0000-4000-8000-000000012003')),60,'Downgrade preserves records and usage');
select is((select count(*) from sponsored_workers where organisation_id = '00000000-0000-4000-8000-000000012003'),
 0::bigint,'Downgraded workspace cannot read paid records through the API');
reset role;
select * from finish();
rollback;
