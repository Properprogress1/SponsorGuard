# UK deployment and environment setup

## Projects and regions

1. Create separate Supabase and Vercel projects for staging and production. In Supabase select **West Europe (London)**, `eu-west-2`, explicitly. In Vercel use Next.js, the repository root and Node.js 22. The checked-in `vercel.json` pins Functions to London, `lhr1`. Confirm both regions in the provider dashboards after provisioning. [Supabase regions](https://supabase.com/docs/guides/platform/regions), [Vercel regions](https://vercel.com/docs/regions)
2. Use Vercel Pro or Enterprise for the subdaily Cron Jobs and confirm the deployment supports the 300-second audit-pack invocation. The London setting covers compute and does not establish UK-only handling by the CDN, billing, email, logs or backups. Record where each service processes and stores data before putting customer data in the app. [Vercel Cron Jobs usage](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing), [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json)
3. Use stable HTTPS domains for both stages. Put preview builds and staging behind deployment protection, using a stable access path for the staging Stripe webhook. Route preview branches to isolated synthetic resources and keep live secrets scoped to production. Grant console access to named MFA-protected accounts and give the deployer only the required permissions.

## Environment variables

Use [.env.example](../.env.example) for local setup. Configure each hosted value in its environment's secret store. The three `NEXT_PUBLIC_` values are embedded in the build and must be present before building or redeploying.

| Variables                                                                                                                  | Value                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                                                | The target project's HTTPS API URL and publishable or anon key.                                                                                                                                        |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                                                | The target project's server-only service credential.                                                                                                                                                   |
| `NEXT_PUBLIC_SITE_URL`, `NOTIFICATION_APP_ORIGIN`, `BILLING_APP_ORIGIN`                                                    | The same canonical HTTPS origin for that environment, without a path.                                                                                                                                  |
| `APP_RATE_LIMIT_SECRET`, `CRON_SECRET`, `NOTIFICATION_UNSUBSCRIBE_SECRET`                                                  | Generate an independent value for each and for each environment using `openssl rand -hex 32`. An unsubscribing link uses the notification secret. Vercel Cron sends the cron secret as a bearer token. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                                                                      | Use a scoped key and a verified sending domain. On staging use a restricted sender and controlled recipients.                                                                                          |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION_ID`                                             | Use test mode in staging and the matching live configuration in production. Use the signing secret from that environment's endpoint.                                                                   |
| `STRIPE_CORE_MONTHLY_PRICE_ID`, `STRIPE_CORE_ANNUAL_PRICE_ID`, `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID` | Recurring GBP prices for £99/month, £990/year, £199/month and £1,990/year respectively.                                                                                                                |
| `RATE_LIMIT_TRUST_PROXY`                                                                                                   | Leave at `0` on Vercel. For other hosts follow the trusted ingress setup in the security review.                                                                                                       |

Authenticate the pinned Supabase CLI using an operator account and inject its database password through the approved secret store. Use the target project reference from the dashboard. Keep command tracing off and use a trusted workstation. Verify the CLI target and dry-run output before applying.

```sh
npm ci
npx supabase link "$SUPABASE_PROJECT_REF"
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

Run this sequence in staging first. [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-config)

Apply migrations before promoting the app. Use a production backup checkpoint before changes, promote the exact commit or build tested in staging with the production environment, and verify liveness and synthetic journeys before opening traffic. A Vercel rollback changes the deployment and scheduled definition. Check schema compatibility before rolling back the app. Use a reviewed forward fix for migration issues where possible. Rehearse down migrations on a disposable clone and assess data-loss implications before using one live. [Database workflow](database.md), [Backup and restore runbook](backup-restore.md)

Configure Supabase Auth site URL and allowlisted HTTPS redirects, email confirmation, TOTP, minimum 12-character passwords, secure password changes, controlled SMTP and both repository email templates. Keep `SPONSORGUARD_LOCAL_HTTP` unset on hosted deployments so cookies stay Secure. Confirm private buckets `sponsorguard-documents` and `sponsorguard-audit-packs` exist with the migration policies. Enable Supabase Cron and confirm `sponsorguard-document-reminders` is active. If the migration ran without `pg_cron`, apply a reviewed follow-up migration using the original schedule block and verify execution. Set up the Stripe portal and webhook events in the billing guide. Verify hosted CSP and rate limiting. [Authentication](authentication.md), [Billing](billing.md), [Security review](security-review.md)

Check Vercel job executions in UTC. Digests and database expiry reminders run at 08:00 UTC, which is 09:00 in London during BST. Application business dates use Europe/London. Audit packs run every five minutes and privacy cleanup runs hourly at minute five. Check job outcomes and provider delivery on staging before launch. Avoid sending any real workforce data during smoke tests. [Monitoring](monitoring.md)

Enable external evidence requests only after configuring and testing the HTTPS scanner. The service receives prevalidated file bytes. Keep its URL and credential on the server. [Evidence request setup](operations-workflows.md#enable-external-submissions)
