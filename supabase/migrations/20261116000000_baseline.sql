-- Shared extension namespace. Domain tables and policies belong in later migrations.
create schema if not exists extensions;
comment on schema extensions is 'Namespace for PostgreSQL extensions';
