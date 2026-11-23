begin;
drop function public.unsubscribe_notification_digests(uuid);
drop function public.finish_notification_digests(uuid[], boolean);
drop function public.claim_notification_digests(date, integer);
drop table public.notification_digest_deliveries;
drop table public.notification_preferences;
commit;
