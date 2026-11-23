-- Supply an existing disposable organisation UUID as organisation_id.
begin;

insert into public.sponsored_workers (organisation_id, full_name, reference, status)
values (:'organisation_id', 'Synthetic Worker 01', 'DEMO-SW-01', 'active')
on conflict (organisation_id, reference) do nothing;

insert into public.engaged_individuals (organisation_id, full_name, reference, engagement_type)
select :'organisation_id'::uuid, 'Synthetic Individual ' || ordinal, 'DEMO-EI-' || ordinal, engagement_type
from unnest(array['employee', 'contractor', 'subcontractor', 'agency', 'platform'])
  with ordinality as engagements(engagement_type, ordinal)
on conflict (organisation_id, reference) do nothing;

insert into public.cos_records (organisation_id, sponsored_worker_id, reference, assigned_on, status)
select organisation_id, id, 'DEMO-COS-01', date '2026-01-06', 'assigned'
from public.sponsored_workers where organisation_id = :'organisation_id' and reference = 'DEMO-SW-01'
on conflict (organisation_id, reference) do nothing;

insert into public.rtw_checks
  (id, organisation_id, engaged_individual_id, checked_on, method, follow_up_on)
select md5(organisation_id::text || ':demo-rtw-01')::uuid, organisation_id, id,
  date '2026-01-06', 'online', date '2026-12-01'
from public.engaged_individuals where organisation_id = :'organisation_id' and reference = 'DEMO-EI-1'
on conflict (id) do nothing;

commit;
