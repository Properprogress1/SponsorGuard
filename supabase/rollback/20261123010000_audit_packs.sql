begin;
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'sponsorguard-audit-packs') then
    raise exception 'Remove audit pack objects through the Storage API before rollback.';
  end if;
end;
$$;
delete from storage.buckets where id = 'sponsorguard-audit-packs';
drop function public.finish_audit_pack(uuid, uuid, timestamptz, text);
drop function public.audit_pack_snapshot(uuid, uuid);
drop function public.claim_audit_pack();
drop function public.queue_audit_pack(uuid);
drop function public.save_audit_pack_checklist(uuid, text[]);
create or replace function public.verify_chain(tenant uuid)
returns table (valid boolean, checked_entries bigint, first_invalid_sequence bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (auth.jwt() ->> 'aal') is distinct from 'aal2'
    or not sponsor_guard_private.is_member(tenant) then
    raise exception 'Ledger access denied.' using errcode = '42501';
  end if;
  return query
    with ordered as (
      select e.*, row_number() over chain as expected_sequence,
        lag(e.entry_hash, 1, decode(repeat('00', 32), 'hex')) over chain as expected_previous
      from public.ledger_entries e
      where e.organisation_id = tenant
      window chain as (order by e.sequence)
    ), result as (
      select count(*) as checked, min(o.sequence) filter (
        where o.sequence <> o.expected_sequence
          or o.prev_hash is distinct from o.expected_previous
          or o.entry_hash is distinct from sponsor_guard_private.ledger_hash(o.prev_hash, o.metadata, o.created_at, o.record_id)
      ) as first_invalid
      from ordered o
    )
    select first_invalid is null, checked, first_invalid from result;
end;
$$;
drop function sponsor_guard_private.check_audit_ledger(uuid);
drop table public.audit_pack_jobs;
drop table public.audit_pack_settings;
commit;
