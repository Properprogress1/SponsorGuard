create table public.security_rate_buckets (
  scope text not null,
  key_hash text not null check (length(key_hash) = 64),
  window_until timestamptz not null,
  attempts integer not null,
  primary key (scope, key_hash)
);
create index security_rate_bucket_expiry on public.security_rate_buckets(window_until);
alter table public.security_rate_buckets enable row level security;
revoke all on public.security_rate_buckets from public, anon, authenticated, service_role;

create function public.consume_security_rate(operation text, network_key text, subject_key text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  config record;
  entry record;
  attempted integer;
  instant timestamptz := clock_timestamp();
begin
  select t.network_limit, t.subject_limit, t.window_seconds into config
  from (values
    ('auth_sign_in', 100, 10, 600),
    ('auth_sign_up', 40, 5, 900),
    ('auth_reset_request', 40, 5, 900),
    ('auth_confirm', 100, 15, 600),
    ('auth_mfa_enrol', 60, 8, 600),
    ('auth_mfa_verify', 100, 12, 600),
    ('auth_password_update', 40, 8, 600),
    ('passport_read', 180, 40, 60),
    ('passport_manage', 80, 20, 60),
    ('partner_invite_read', 100, 25, 60)
  ) t(name,network_limit,subject_limit,window_seconds) where t.name = operation;
  if not found or network_key is null or network_key !~ '^[0-9a-f]{64}$' or
    (subject_key is not null and subject_key !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid rate limit input.' using errcode = '22023';
  end if;

  for entry in
    select * from (values ('network',network_key,config.network_limit), ('subject',subject_key,config.subject_limit))
      as x(bucket,key_hash,budget) where x.key_hash is not null order by x.bucket
  loop
    insert into public.security_rate_buckets as b (scope,key_hash,window_until,attempts)
      values (operation || ':' || entry.bucket, entry.key_hash,
        instant + make_interval(secs => config.window_seconds), 1)
    on conflict (scope,key_hash) do update set
      attempts = case when b.window_until <= instant then 1 else least(b.attempts + 1, entry.budget + 1) end,
      window_until = case when b.window_until <= instant then excluded.window_until else b.window_until end
    returning attempts into attempted;
    -- Enforce the network budget first so it also bounds new subject rows.
    if attempted > entry.budget then return false; end if;
  end loop;
  return true;
end;
$$;

create function public.purge_security_rate_buckets()
returns void language sql security definer set search_path = ''
as $$
  delete from public.security_rate_buckets where window_until <= now();
$$;

revoke all on function public.consume_security_rate(text,text,text), public.purge_security_rate_buckets()
  from public, anon, authenticated, service_role;
grant execute on function public.consume_security_rate(text,text,text), public.purge_security_rate_buckets() to service_role;
