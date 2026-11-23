# Security review

## Findings and fixes

| Finding                                                                                            | Control and verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant isolation depends on database policy as well as the app route guards.                       | CI rejects every regular or partitioned table without RLS in the disposable database. All 39 application tables have RLS. The guard also checks the test Auth and Storage tables. PostgreSQL system objects and the Supabase CLI migration-history table are excluded. API-readable application views must use `security_invoker`, which preserves the underlying RLS. pgTAP exercises roles, MFA, tenant boundaries, partner revocation, Passport scopes, private Storage and direct API plan limits.                                                                                               |
| `SECURITY DEFINER` bypasses caller privileges.                                                     | Reviewed 63 application-owned definer functions for schema-qualified references, fixed search paths and caller checks. CI requires an empty search path and rejects PUBLIC or anonymous EXECUTE grants. Trigger definer functions must be inaccessible to application roles. Authenticated EXECUTE grants must appear on the reviewed allowlist. An explicit list of server-only functions checks grants for Passport, Stripe, scheduled work, privacy and throttling. Tenant-facing grants rely on the function's caller, organisation, role and MFA checks and are exercised by the policy suites. |
| Browser pages lacked an enforced script policy.                                                    | The production CSP generates a fresh cryptographic nonce per document. It blocks unapproved inline scripts, object embeds and framing. The response also sets anti-framing, MIME sniffing, referrer and Permissions Policy headers and production HSTS. Auth, workspace and sharing responses use private, no-store caching. The unsubscribe handler has its own no-script CSP. Playwright checks nonce changes and that pages still run with the policy enforced.                                                                                                                                   |
| App-level abuse controls previously relied on provider defaults and the Passport passcode lockout. | A Postgres limiter now applies to sign-in, registration, password reset, email confirmation, password changes, TOTP enrolment and verification, Passport reads and creation, and partner invitation inspection and acceptance. Database writes are atomic across application instances. Separate network and subject budgets protect against retries from one IP or against one account or token. The Passport passcode lockout remains a separate control. Revocation stays available to authorised managers at any time.                                                                           |
| Secrets and dependency advisories lacked a CI gate.                                                | CI audits both runtime and development dependencies at moderate severity or higher and runs the pinned Gitleaks image against fetched Git history. The local file scan initially flagged a synthetic Stripe test key, which was replaced with an inert SDK fixture. The history scan exempts only the exact old fixture in that one test file. The npm audit initially identified seven development-tree advisories around a transitive matcher dependency. Compatible lockfile updates resolved them.                                                                                               |
| Diagnostics needed a safe log format.                                                              | Rate-limit denials and failures, Stripe webhook rejections and retries, and scheduled job outcomes emit JSON with allowlisted fields. The logger constructs the object explicitly and omits IPs, emails, identifiers, headers, URLs, raw errors and payloads. Application logs are separate from the database's purpose-specific audit, access and delivery records.                                                                                                                                                                                                                                 |

## Deployment controls

Set `APP_RATE_LIMIT_SECRET` to an independently generated value. For example, use
`openssl rand -hex 32` and store the result in the deployment's secret manager.
The server also needs the Supabase service-role key. Protected actions fail
closed if the limiter is unavailable or either setting is missing. Store
neither secret in client configuration. Rotating the limiter secret starts new
buckets.

On Vercel the limiter uses the platform's `x-vercel-forwarded-for` header. On
other hosts, set `RATE_LIMIT_TRUST_PROXY=1` only if the app is reachable solely
through a proxy that overwrites `X-Forwarded-For` with one verified client
address. In other cases the limiter uses a shared network bucket. The table
holds HMACs and counters. The scheduled privacy job deletes expired buckets and
must be enabled for production. Deploy the security migration before the app
so protected actions can use the limiter immediately.

## Residual risks

- The hosted Supabase Auth API can be called outside the app. Its own rate
  limits, bot protections and alerting still matter. Partner invitation RPCs
  remain callable by authenticated clients and enforce a valid high-entropy
  token, the verified recipient, MFA and direct owner consent for acceptance.
  Protect the invitation tables because the unkeyed recipient email digests
  could be matched against likely addresses if the data were disclosed.
- Fixed windows allow short bursts around a boundary. Shared networks can
  exhaust a network budget for several legitimate users. Large request floods
  and audit-log volume still need infrastructure controls. Monitor limiter
  errors, denied request volume and privacy-job failures.
- CSP permits inline styles required by current UI primitives and partner
  branding. Script nonces require dynamic rendering and disable shared HTML
  caching. HSTS covers the application hostname.
- Confirmation and recovery links include tokens in their URLs. Browser
  referrers are disabled. Configure the hosting, email and Supabase providers
  to redact sensitive URLs, bodies and headers from their own logs. Signed
  document URLs remain bearer credentials until they expire. Recipients can
  retain downloaded files and copies of shared records.
- The service role and database owners can bypass RLS. CI verifies
  application-owned tables and functions and tests representative managed
  schemas locally. Hosted grants, backups, network controls, credential
  rotation and provider logging require a deployment review. The ledger is
  tamper-evident and has no external timestamping.
- Uploads have MIME, size and file-signature checks. The malware hook is
  stubbed and requires a scanner before relying on malware detection.
- Secret detection is pattern-based. The local workspace has no Git history,
  so the local scan covers the file tree. GitHub Actions is configured to scan
  history on a real checkout. A hosted CI run and PR could not be verified from
  this workspace.

## Reproduce

Run `npm run check`, `npm run audit:dependencies`,
`gitleaks dir --redact=100 --config .gitleaks.toml .` and the Playwright
commands in the README. Use the standalone PostgreSQL commands in the database
guide to apply the migrations and run the RLS, function grant and pgTAP checks.
The browser journeys cover onboarding with TOTP, manual worker creation,
reporting, document upload and download, Passport creation and revocation,
and Core plan limits enforced through the API.

- [Next.js Content Security Policy guide](https://nextjs.org/docs/app/guides/content-security-policy)
- [Vercel request headers](https://vercel.com/docs/headers/request-headers)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [npm audit documentation](https://docs.npmjs.com/cli/commands/npm-audit/)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
