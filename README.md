# SponsorGuard

SponsorGuard UK uses Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui and
Supabase. Sign-in uses email and password with mandatory authenticator MFA.

## Fresh clone

Prerequisites are Node.js 22 (see `.nvmrc`) and npm. Running local authentication
also requires a Docker-compatible runtime.

```sh
nvm install
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://127.0.0.1:3000>. `GET /api/health` returns HTTP 200 with
`{"status":"ok"}` and `Cache-Control: no-store`. The landing page, health route
and build work without Supabase credentials. Follow the local database steps
below to sign in.

## Checks

```sh
npm run check                         # ESLint, Prettier, TypeScript, Vitest
npx playwright install chromium      # once per Playwright version
npm run test:e2e                      # builds, starts, tests, stops the app
```

On Linux, use `npx playwright install --with-deps chromium` to install browser
system dependencies too. If Chromium is unavailable for your OS, run
`PLAYWRIGHT_USE_CHROME=1 npm run test:e2e` with Google Chrome installed. Keep port
3000 free for Playwright's production server. Reports are written to
`playwright-report/`, with failure screenshots and traces in `test-results/`.

```sh
npm run format                       # format source and documentation
npm run test:watch                   # interactive unit tests
npm run build
npm start                            # serve the production build
```

## Local database

Install and start a Docker-compatible runtime first. The Supabase CLI is a locked
dev dependency; no global CLI installation or Supabase account is required.

```sh
npm run db:start                     # first run downloads Supabase images
npx supabase status                  # local URLs and development keys
npm run db:reset                     # rebuild local DB and apply all migrations
npm run db:test                      # pgTAP tests
```

`db:reset` deletes local database data. Copy the local API URL and publishable
or anon key and the service-role key from `supabase status` into `.env.local`.
Generate `APP_RATE_LIMIT_SECRET` with `openssl rand -hex 32` and place it in the
same file. Confirmation and password reset emails appear in [Mailpit](http://127.0.0.1:54324). Run `npm run db:stop`
when you finish. See [Authentication and onboarding](docs/authentication.md)
for hosted configuration and the authentication browser test command.

## CI and documentation

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pushes and pull
requests, without repository secrets. Jobs check code quality, scan dependencies
and Git history, verify migrations and privileged database access with PostgreSQL
17 and pgTAP, and run Chromium tests against a production build. CI installs
with `npm ci`.

- [Architecture and file layout](docs/architecture.md)
- [Database development and CI reproduction](docs/database.md)
- [People records, CSV import and synthetic data](docs/people.md)
- [Reporting deadlines, rule versions and tasks](docs/reporting.md)
- [Private document vault and expiry reminders](docs/documents.md)
- [Compliance Passport ledger and verification](docs/ledger.md)
- [Passport sharing](docs/passport-sharing.md)
- [Key personnel and handover](docs/key-personnel.md)
- [Workforce right-to-work records and exports](docs/workforce.md)
- [Scheduled email digests and preferences](docs/notifications.md)
- [Audit packs and background generation](docs/audit-packs.md)
- [Stripe billing and plan limits](docs/billing.md)
- [Partner invitations, client access and branding](docs/partners.md)
- [Privacy data map, retention and erasure](docs/privacy.md)
- [Public pages, SEO and accessibility checks](docs/public-site.md)
- [Launch checklist and operational runbooks](docs/launch-checklist.md)
- [UK deployment and environment setup](docs/deployment.md)
- [Security review and deployment controls](docs/security-review.md)
- [Weekly actions, evidence and change review](docs/operations-workflows.md)
- [Brand direction and paid pilot](docs/paid-pilot.md)
- [Testing conventions](docs/testing.md)

Read [AGENTS.md](AGENTS.md) before making changes.
