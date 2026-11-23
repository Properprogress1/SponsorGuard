create view public.weekly_queue_items with (security_invoker = true) as
select s.organisation_id, s.kind, s.record_id, s.due_on, a.assignee,
  coalesce(a.escalated, false) as escalated,
  coalesce(a.handed_back, false) as handed_back
from public.weekly_action_sources s
left join public.weekly_actions a
  using (organisation_id, kind, record_id);

revoke all on public.weekly_queue_items from public, anon, authenticated, service_role;
grant select on public.weekly_queue_items to authenticated;
