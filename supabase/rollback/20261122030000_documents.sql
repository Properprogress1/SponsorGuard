-- Empty the bucket through the Storage API before reverting.
begin;
do $$
begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'sponsorguard-document-reminders') then
      perform cron.unschedule('sponsorguard-document-reminders');
    end if;
  end if;
end;
$$;

drop policy vault_server_delete on storage.objects;
drop policy vault_server_update on storage.objects;
drop policy vault_server_insert on storage.objects;
drop policy vault_deny_anon_read on storage.objects;
drop policy vault_require_membership on storage.objects;
drop policy vault_member_read on storage.objects;
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'sponsorguard-documents') then
    raise exception 'Empty the document bucket via the Storage API before reverting.';
  end if;
end;
$$;
set local storage.allow_delete_query = 'true';
delete from storage.buckets where id = 'sponsorguard-documents';
drop function sponsor_guard_private.may_read_document_object(text);
drop function public.queue_document_expiry_notifications(date);
drop table public.document_notifications;
drop table public.documents;
commit;
