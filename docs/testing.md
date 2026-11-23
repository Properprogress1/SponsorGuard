# Testing

Read the root [AGENTS.md](../AGENTS.md) before starting repository work.

`npm run check` runs the same quality checks as CI, including formatting.
Type checking invokes `next typegen` first so it also works on a clean clone
before a build has produced route types.

Vitest runs only `src/**/*.test.ts` and `src/**/*.test.tsx`; it does not collect
Playwright specs. React tests use jsdom, Testing Library, and jest-dom matchers,
with cleanup after each test. Route-handler tests opt into the Node environment.
The initial tests cover home-page accessibility and the health response contract.

Playwright uses Chromium and runs against `next build` plus `next start`, both
locally and in CI. It verifies the rendered page, navigation, and HTTP health
contract. CI rejects focused tests, retries failures twice, and uploads reports.
The `auth` project runs real Supabase Auth and Mailpit flows for sign-up, TOTP,
onboarding, viewer routing and password recovery. See [auth test setup](authentication.md#run-the-browser-checks).
Use `npx playwright show-report` after a run to inspect the HTML report.
If Playwright cannot install Chromium on your OS, you can use an existing Google
Chrome installation with `PLAYWRIGHT_USE_CHROME=1 npm run test:e2e`.

Database tests use pgTAP and must call `plan(...)` and `finish()`. Wrap each test
file in a transaction and roll it back. Both `supabase test db` and CI's
`pg_prove` fail on assertion failures; merely running tests through `psql`
would not reliably fail the job on a TAP assertion failure.

All initial checks work without application secrets. CI's PostgreSQL password is
only for its disposable service container.
