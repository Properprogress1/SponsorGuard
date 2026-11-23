do $$
declare
  missing_rls text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname)
    into missing_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and not c.relrowsecurity
    and n.nspname !~ '^pg_'
    and n.nspname <> 'information_schema'
    -- This table is created by the CLI after migrations begin, for bookkeeping.
    and (n.nspname, c.relname) <> ('supabase_migrations', 'schema_migrations');

  if missing_rls is not null then
    raise exception 'Row-level security must be enabled on: %', missing_rls;
  end if;
end;
$$;
