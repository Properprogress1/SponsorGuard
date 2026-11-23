# Database workflow

The Supabase CLI is installed by `npm ci`. Local development uses PostgreSQL 17
and the ports in `supabase/config.toml` (API 54321, database 54322, Studio 54323).
Local startup requires Docker and may take several minutes on its first run.
Automatic seeding is disabled. See [synthetic People records](people.md#synthetic-data)
to seed a disposable local organisation explicitly.

```sh
npm run db:start
npx supabase migration new describe_change
# Edit the new supabase/migrations/<timestamp>_describe_change.sql file.
npm run db:migrate
npm run db:test
```

Use `npm run db:reset` to check that the entire migration history works from
scratch. This destroys local database data. Do not edit a migration once it has
been applied to a shared environment; add a new migration instead. This scaffold
does not link or deploy to a hosted Supabase project.

Tests live in `supabase/tests/database/`. The baseline checks the extension
namespace and the comment written by the migration. pgTAP is enabled inside
the test transaction, not installed as a production migration dependency.
See [Supabase database testing](https://supabase.com/docs/guides/database/testing).

On CI's disposable database, reverse the baseline by dropping the empty
`extensions` schema with `DROP SCHEMA extensions RESTRICT` and marking the
migration reverted in Supabase migration history. On local Supabase, where the
stack supplies the schema, preserve it and restore its previous schema comment
before marking the migration reverted. Future migrations that introduce tenant
tables must test row-level security across tenants.

## Reproduce CI's standalone PostgreSQL checks

CI uses a disposable `postgres:17-bookworm` service and installs
`postgresql-17-pgtap` inside it. Its host needs `psql` and `pg_prove` (on Ubuntu,
`postgresql-client` and `libtap-parser-sourcehandler-pgtap-perl`). For a local
Docker equivalent:

```sh
docker run --detach --rm --name sponsorguard-ci-db \
  -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17-bookworm
docker exec sponsorguard-ci-db apt-get update
docker exec sponsorguard-ci-db apt-get install -y --no-install-recommends postgresql-17-pgtap
# Wait until this reports that PostgreSQL is accepting connections:
docker exec sponsorguard-ci-db pg_isready -U postgres -d postgres

export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ci/bootstrap-auth.sql -f supabase/ci/bootstrap-storage.sql
npx supabase migration up --remote="$DATABASE_URL" --yes
npx supabase migration up --remote="$DATABASE_URL" --yes
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ci/check-rls.sql -f supabase/ci/check-definers.sql
PGPASSWORD=postgres pg_prove --host 127.0.0.1 --port 55432 \
  --username postgres --dbname postgres --verbose --recurse supabase/tests

docker stop sponsorguard-ci-db
```

The second migration invocation verifies that the CLI records migration history
and skips already-applied migrations. SQL errors stop migration execution;
failed pgTAP assertions stop the database job.

The standalone service uses minimal Supabase Auth and Storage schemas to test
user identity and database policies. Full-stack CI also runs the document policy
tests and browser signing flow against Supabase Storage.
The CI guard checks regular and partitioned tables across application schemas.
PostgreSQL system schemas and the CLI's migration history table are outside
the application schema check.

## Tenant access

| Action                                        | Owner | Admin | HR user | Viewer |
| --------------------------------------------- | ----- | ----- | ------- | ------ |
| Read own organisations and membership rosters | Yes   | Yes   | Yes     | Yes    |
| Rename an organisation                        | Yes   | Yes   |         |        |
| Assign, change or remove admins               | Yes   |       |         |        |
| Assign, change or remove HR users and viewers | Yes   | Yes   |         |        |
| Read the organisation's audit log             | Yes   | Yes   |         |        |

Authenticated users create, read and update their own profile. A trusted server
using `service_role` provisions organisations and owner memberships together
in a transaction. The same role can append audit events. Audit rows contain an
organisation ID, a fixed event type, a generated ID and a timestamp. Application
code must explicitly record events when it adds audited workflows.

The onboarding RPC lets an authenticated user with a verified MFA session
provision their first organisation in one transaction. It records ownership,
the caller's profile and an audit event. Retries by a user with a membership
return an existing organisation. Restrictive RLS policies enforce MFA when
authenticated users access tenant tables via the database API as well as the app.

To revert the MFA/onboarding schema, run
`supabase/rollback/20261122000000_mfa_onboarding.sql` and mark version
`20261122000000` reverted in Supabase migration history. This removes the RPC
and MFA policies and preserves organisations already provisioned. Apply this
rollback before reverting the tenant migration.

On a disposable database, reverse the tenant migration by running
`supabase/rollback/20261121000000_tenant_access.sql` with `psql -v ON_ERROR_STOP=1`
and marking version `20261121000000` reverted in Supabase migration history.
The rollback drops tenant data and preserves Supabase Auth users.
