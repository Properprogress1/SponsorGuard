begin;
drop function public.purge_security_rate_buckets();
drop function public.consume_security_rate(text,text,text);
drop table public.security_rate_buckets;
commit;
