create table public.engagement_categories (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_-]{0,39}$'),
  label text not null check (char_length(btrim(label)) between 1 and 80 and label !~ '[[:cntrl:]]'),
  primary key (organisation_id, key)
);

alter table public.engagement_categories enable row level security;
revoke all on public.engagement_categories from public, anon, authenticated, service_role;
grant select, insert (organisation_id, key, label), update (label) on public.engagement_categories to authenticated;
create policy engagement_categories_read on public.engagement_categories for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.is_member(organisation_id));
create policy engagement_categories_insert on public.engagement_categories for insert to authenticated
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'));
create policy engagement_categories_update on public.engagement_categories for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'))
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.has_role(organisation_id, 'owner', 'admin'));

create function sponsor_guard_private.default_engagement_categories()
returns table (key text, label text) language sql immutable set search_path = ''
as $$
  values ('employee', 'Employee'), ('contractor', 'Contractor'), ('subcontractor', 'Subcontractor'),
    ('agency', 'Agency'), ('platform', 'Platform');
$$;
revoke all on function sponsor_guard_private.default_engagement_categories() from public, anon, authenticated, service_role;

create function sponsor_guard_private.seed_engagement_categories()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.engagement_categories (organisation_id, key, label)
    select new.id, key, label from sponsor_guard_private.default_engagement_categories();
  return null;
end;
$$;
revoke all on function sponsor_guard_private.seed_engagement_categories() from public, anon, authenticated, service_role;
create trigger organisation_engagement_categories after insert on public.organisations
  for each row execute function sponsor_guard_private.seed_engagement_categories();

insert into public.engagement_categories (organisation_id, key, label)
select o.id, c.key, c.label from public.organisations o cross join sponsor_guard_private.default_engagement_categories() c;

alter table public.engaged_individuals
  drop constraint engaged_individuals_engagement_type_check,
  add constraint engaged_individuals_category_fk foreign key (organisation_id, engagement_type)
    references public.engagement_categories (organisation_id, key),
  add column check_responsibility text
    check (check_responsibility is null or (char_length(btrim(check_responsibility)) between 1 and 120 and check_responsibility !~ '[[:cntrl:]]'));

grant insert (check_responsibility), update (check_responsibility) on public.engaged_individuals to authenticated;
create index rtw_individual_latest_idx on public.rtw_checks (organisation_id, engaged_individual_id, checked_on desc, id desc);

create view public.workforce_map with (security_invoker = true) as
select p.organisation_id, p.id, p.full_name, p.reference, p.engagement_type, category.label as engagement_label,
  p.check_responsibility, latest.checked_on, latest.follow_up_on,
  case
    when latest.checked_on is null then 'missing'
    when latest.follow_up_on <= (now() at time zone 'Europe/London')::date then 'due'
    when latest.follow_up_on is not null then 'scheduled'
    else 'recorded'
  end as check_status
from public.engaged_individuals p
join public.engagement_categories category on (category.organisation_id, category.key) = (p.organisation_id, p.engagement_type)
left join lateral (
  select c.checked_on, c.follow_up_on
  from public.rtw_checks c
  where c.organisation_id = p.organisation_id and c.engaged_individual_id = p.id
  order by c.checked_on desc, c.id desc
  limit 1
) latest on true;

revoke all on public.workforce_map from public, anon, authenticated, service_role;
grant select on public.workforce_map to authenticated;
