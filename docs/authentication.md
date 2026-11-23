# Authentication and onboarding

Users confirm their email, set up a time-based authenticator and verify a code.
Subsequent password sign-ins require a fresh authenticator challenge. The email
links open a confirmation form so a link scanner's GET request leaves the token
usable. Password recovery uses a short-lived cookie tied to the verified recovery
session. A user with an enrolled authenticator must verify it before changing
their password.

The two-step onboarding wizard collects a name for the organisation and a display
name for the owner, then shows a review before submission. One database transaction
creates the organisation, owner membership, profile and audit event. Workspace
sections are navigated by organisation. Dashboard, People, Reporting, Documents
and Passport are available to all four roles. Key Personnel and Settings require
owner or admin access. The shell provides navigation and checks access before the
section renders. Section-specific workflows can be added separately.

## Run the browser checks

Start the local Supabase stack and put its URL and publishable or anon key in
`.env.local`. Export `NEXT_PUBLIC_SUPABASE_URL` and the local
`SUPABASE_SERVICE_ROLE_KEY` in your shell for test fixtures.
Tests accept loopback Supabase URLs and read confirmation and recovery emails
from Mailpit. Keep port 3000 available for the Playwright production server.

```sh
npm run db:start
npx supabase status
npx playwright install chromium
npm run test:e2e:auth
```

CI starts its own disposable Supabase instance and runs both Playwright projects.
The auth project disables trace, screenshots and video because the flow displays
one-time secrets. Its failure diagnostics stay in the ignored `auth-test-results/`
directory and CI uploads only smoke-test reports. Playwright permits HTTP cookies
and uses a synthetic rate-limit secret for its loopback server. For interactive
development, set the service-role key and `APP_RATE_LIMIT_SECRET` in `.env.local`
before running `npm run dev`.

## Hosted Supabase

Use the hosted HTTPS site URL, enable email confirmation and TOTP, set a minimum
password length of 12 characters, and enable secure password changes. Use a
configured SMTP provider. Copy the confirmation and recovery templates from
`supabase/templates/` into Supabase Auth and apply the migrations. The application
uses a publishable or anon key for authentication and onboarding. The validated
document upload action, the authentication rate limiter and local browser
fixtures use a server-only service-role key. Generate a separate
`APP_RATE_LIMIT_SECRET` for production and review the Supabase Auth limits and
proxy settings. See [Security review](security-review.md).
