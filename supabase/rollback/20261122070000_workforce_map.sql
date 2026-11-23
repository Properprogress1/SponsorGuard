begin;
-- Restore the original model only after custom assignments have been remapped.
do $$
begin
  if exists (select 1 from public.engaged_individuals where engagement_type not in
    ('employee', 'contractor', 'subcontractor', 'agency', 'platform')) then
    raise exception 'Reassign custom engagement categories before rolling back the workforce map.';
  end if;
end;
$$;
drop view public.workforce_map;
drop index public.rtw_individual_latest_idx;
alter table public.engaged_individuals drop column check_responsibility,
  drop constraint engaged_individuals_category_fk,
  add constraint engaged_individuals_engagement_type_check check
    (engagement_type in ('employee', 'contractor', 'subcontractor', 'agency', 'platform'));
drop trigger organisation_engagement_categories on public.organisations;
drop function sponsor_guard_private.seed_engagement_categories();
drop function sponsor_guard_private.default_engagement_categories();
drop table public.engagement_categories;
commit;
