begin;
do $$
begin
  if exists (select 1 from public.privacy_storage_cleanup) then
    raise exception 'Finish outstanding privacy file erasures before rollback.';
  end if;
end;
$$;
drop function public.privacy_recent_access(uuid);
drop function public.log_privacy_download(uuid,text,uuid,uuid);
drop function public.finish_privacy_storage(text,text,uuid);
drop function public.claim_privacy_storage();
drop function public.privacy_pending_storage(uuid);
drop function public.purge_privacy_due(date);
drop function public.erase_privacy_person(uuid,text,uuid,text);
drop function sponsor_guard_private.erase_person_records(uuid,text,uuid,text,date);
drop function public.export_privacy_person(uuid,text,uuid,text);
drop function public.set_privacy_person(uuid,text,uuid,date,boolean);
drop function public.set_privacy_retention(uuid,text,date,integer,text);
drop function public.privacy_people(uuid);
drop function sponsor_guard_private.lock_privacy_tenant(uuid);
drop function sponsor_guard_private.person_row(uuid,text,uuid);
drop table public.privacy_storage_cleanup, public.privacy_access_log, public.privacy_person_controls, public.privacy_retention_rules;
update public.audit_pack_jobs set failure = 'generation_failed' where failure = 'privacy_erasure';
alter table public.audit_pack_jobs drop constraint audit_pack_jobs_failure_check;
alter table public.audit_pack_jobs add constraint audit_pack_jobs_failure_check check
  (failure in ('too_large','document_unavailable','generation_failed','access_changed'));
commit;
