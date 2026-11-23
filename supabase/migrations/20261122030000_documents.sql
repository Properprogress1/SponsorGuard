insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sponsorguard-documents', 'sponsorguard-documents', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png']);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  sponsored_worker_id uuid,
  engaged_individual_id uuid,
  document_type text not null check (document_type in ('right_to_work', 'identity', 'sponsorship', 'other')),
  issued_on date check (issued_on between date '0001-01-01' and date '9999-12-31'),
  expires_on date check (expires_on between date '0001-01-01' and date '9999-12-31'),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  scan_status text not null check (scan_status in ('not_scanned', 'clean')),
  state text not null default 'pending' check (state in ('pending', 'ready')),
  object_path text generated always as (organisation_id::text || '/' || id::text) stored unique,
  created_at timestamptz not null default now(),
  check (num_nonnulls(sponsored_worker_id, engaged_individual_id) = 1),
  check (expires_on >= issued_on),
  unique (organisation_id, id),
  foreign key (organisation_id, sponsored_worker_id)
    references public.sponsored_workers (organisation_id, id),
  foreign key (organisation_id, engaged_individual_id)
    references public.engaged_individuals (organisation_id, id)
);
create index documents_worker_idx on public.documents (organisation_id, sponsored_worker_id);
create index documents_individual_idx on public.documents (organisation_id, engaged_individual_id);
create index documents_recent_idx on public.documents (organisation_id, created_at desc, id);
create index documents_expiry_idx on public.documents (expires_on)
  where state = 'ready' and expires_on is not null;

create table public.document_notifications (
  organisation_id uuid not null,
  document_id uuid not null,
  days_before integer not null check (days_before in (90, 30, 7)),
  remind_on date not null,
  created_at timestamptz not null default now(),
  primary key (document_id, days_before),
  foreign key (organisation_id, document_id) references public.documents (organisation_id, id) on delete cascade
);
create index document_notifications_recent_idx on public.document_notifications (organisation_id, remind_on desc);

alter table public.documents enable row level security;
alter table public.document_notifications enable row level security;
revoke all on public.documents, public.document_notifications from public, anon, authenticated, service_role;
grant select on public.documents, public.document_notifications to authenticated;
grant select, insert, delete on public.documents to service_role;
grant update (state) on public.documents to service_role;
grant select, insert on public.document_notifications to service_role;

create policy documents_members_read on public.documents for select to authenticated
  using (state = 'ready' and (select auth.jwt() ->> 'aal') = 'aal2'
    and sponsor_guard_private.is_member(organisation_id));
create policy notifications_members_read on public.document_notifications for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and sponsor_guard_private.is_member(organisation_id));

create function sponsor_guard_private.may_read_document_object(path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.jwt() ->> 'aal') = 'aal2' and exists (
    select 1 from public.documents doc
    where doc.object_path = path and doc.state = 'ready'
      and sponsor_guard_private.is_member(doc.organisation_id)
  );
$$;
revoke all on function sponsor_guard_private.may_read_document_object(text) from public, anon, authenticated, service_role;
grant execute on function sponsor_guard_private.may_read_document_object(text) to authenticated;

create policy vault_member_read on storage.objects for select to authenticated
  using (bucket_id = 'sponsorguard-documents' and sponsor_guard_private.may_read_document_object(name));

-- These restrictions stay in force even if a future feature adds a broad
-- permissive Storage policy for another bucket.
create policy vault_require_membership on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'sponsorguard-documents' or sponsor_guard_private.may_read_document_object(name));
create policy vault_deny_anon_read on storage.objects as restrictive for select to anon
  using (bucket_id <> 'sponsorguard-documents');
create policy vault_server_insert on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'sponsorguard-documents');
create policy vault_server_update on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'sponsorguard-documents') with check (bucket_id <> 'sponsorguard-documents');
create policy vault_server_delete on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'sponsorguard-documents');

create function public.queue_document_expiry_notifications(
  run_on date default (now() at time zone 'Europe/London')::date
)
returns bigint language sql set search_path = ''
as $$
  with created as (
    insert into public.document_notifications (organisation_id, document_id, days_before, remind_on)
    select doc.organisation_id, doc.id, schedule.days_before, doc.expires_on - schedule.days_before
    from public.documents doc
    cross join (values (90), (30), (7)) schedule(days_before)
    where doc.state = 'ready' and doc.expires_on between run_on and run_on + 90
      and doc.expires_on - schedule.days_before <= run_on
    on conflict (document_id, days_before) do nothing
    returning 1
  )
  select count(*) from created;
$$;
revoke all on function public.queue_document_expiry_notifications(date) from public, anon, authenticated, service_role;
grant execute on function public.queue_document_expiry_notifications(date) to service_role;

-- Standalone PostgreSQL CI supplies no cron daemon. Supabase supplies pg_cron.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and 'pg_cron' = any(regexp_split_to_array(current_setting('shared_preload_libraries'), '\s*,\s*')) then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('sponsorguard-document-reminders', '0 8 * * *',
      'select public.queue_document_expiry_notifications();');
  end if;
end;
$$;
