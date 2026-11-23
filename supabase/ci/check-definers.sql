do $$
declare
  violations text;
  authenticated_access constant text[] := array[
    'public.accept_partner_invitation', 'public.cancel_partner_invitation',
    'public.configure_partner', 'public.create_partner_invitation',
    'public.erase_privacy_person', 'public.export_privacy_person',
    'public.inspect_partner_invitation', 'public.list_partner_connections',
    'public.onboard_organisation', 'public.privacy_pending_storage',
    'public.privacy_people', 'public.privacy_recent_access', 'public.queue_audit_pack',
    'public.revoke_passport_share', 'public.save_audit_pack_checklist',
    'public.save_health_checklist', 'public.set_privacy_person',
    'public.set_privacy_retention', 'public.update_partner_link', 'public.verify_chain',
    'public.review_evidence_request', 'public.weekly_action_roster', 'public.workspace_access', 'public.workspace_billing', 'public.workspace_partner_brand',
    'sponsor_guard_private.has_any_plan', 'sponsor_guard_private.has_direct_role',
    'sponsor_guard_private.has_plan', 'sponsor_guard_private.has_role',
    'sponsor_guard_private.is_member', 'sponsor_guard_private.may_read_document_object'
  ];
  service_only constant text[] := array[
    'recover_interrupted_evidence', 'reserve_evidence_upload', 'finish_evidence_upload', 'issue_passport_share', 'probe_passport_share', 'open_passport_share',
    'queue_document_expiry_notifications', 'claim_notification_digests',
    'finish_notification_digests', 'unsubscribe_notification_digests',
    'claim_audit_pack', 'audit_pack_snapshot', 'finish_audit_pack',
    'stripe_customer_for', 'bind_stripe_customer', 'reserve_stripe_checkout',
    'begin_stripe_observation', 'apply_stripe_observation',
    'release_stripe_checkout', 'release_stripe_observation',
    'purge_privacy_due', 'claim_privacy_storage', 'finish_privacy_storage',
    'log_privacy_download', 'consume_security_rate', 'purge_security_rate_buckets'
  ];
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by n.nspname, p.proname)
    into violations
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'sponsor_guard_private')
    and p.prosecdef
    and not exists (
      select from pg_catalog.pg_depend d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
    and (
      not coalesce('search_path=""' = any(p.proconfig), false)
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not (n.nspname || '.' || p.proname = any(authenticated_access)))
      or exists (
        select from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
      or (p.prorettype = 'trigger'::regtype and (
        has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('service_role', p.oid, 'EXECUTE')
      ))
      or (n.nspname = 'public' and p.proname = any(service_only) and (
        has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
      ))
    );
  if violations is not null then
    raise exception 'Unsafe SECURITY DEFINER configuration or grants: %', violations;
  end if;

  select string_agg(c.oid::regclass::text, ', ' order by c.relname)
    into violations
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'sponsor_guard_private') and c.relkind in ('v', 'm')
    and (has_any_column_privilege('anon', c.oid, 'SELECT')
      or has_any_column_privilege('authenticated', c.oid, 'SELECT'))
    and not coalesce('security_invoker=true' = any(c.reloptions), false);
  if violations is not null then
    raise exception 'API-readable views must use security_invoker: %', violations;
  end if;
end;
$$;
