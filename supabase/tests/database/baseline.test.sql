begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);
select has_schema('extensions', 'Baseline creates the extension namespace');
select is(
  obj_description('extensions'::regnamespace, 'pg_namespace'),
  'Namespace for PostgreSQL extensions',
  'Baseline migration applied its schema comment'
);
select * from finish();

rollback;
