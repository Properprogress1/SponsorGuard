# Launch checklist

Release owner, candidate Git SHA, target date and evidence location to be recorded in the release ticket. Keep gates open until the named owner signs off on evidence from the target environment. This is the baseline gate list for this repository.

## Release and environment

- [ ] Engineering confirms hosted CI is green for the candidate, including lint, typecheck, unit tests, dependency and secret scanning, PostgreSQL migrations and pgTAP, Playwright and Lighthouse accessibility of at least 95.
- [ ] Platform verifies London Vercel Functions and Supabase, stable HTTPS domains, separate staging and production resources, protected previews, and build-time and server-only environment variables. Record where providers process and store data. [Deployment and environment setup](deployment.md)
- [ ] Platform verifies provider auth settings, confirmation and recovery mail, mandatory TOTP, both private buckets and rejected cross-tenant access. Check CSP, private cache headers, throttling and secret rotation. [Security review](security-review.md)
- [ ] Release owner confirms a staged migration, approved restore point, compatible rollback or forward-fix plan and a reviewed production promotion window. Do not load demo records into production. [Database workflow](database.md)

## Product and rules

- [ ] Product records review outcomes for all three `VERIFY` seeds, approved effective versions, close-out evidence and England and Wales holiday coverage. [Seed rules review](seed-rules-review.md)
- [ ] Engineering signs off fresh-account onboarding, role guards, worker creation and plan enforcement via API, reporting and tasks, document uploads and signed downloads, Passport creation and revocation, ledger verification and a downloadable audit pack.
- [ ] Engineering and privacy sign off partner consent and revocation, exports, erasure, retention holds and cleanup. Review the internal upload scanner stub. Exercise the separate fail-closed scanner before enabling external evidence uploads. [Privacy data map](privacy.md), [Document vault](documents.md)
- [ ] Billing tests checkout, portal, signature verification and replay with test credentials. Confirm live GBP prices, webhook configuration and operational ownership before enabling live payments. [Billing](billing.md)
- [ ] Product and privacy review customer-facing Terms, Privacy, DPA, trademark clearance and published wording. Confirm statements describe record tracking without guarantees, immigration advice or scores. Check data processing and subprocessor arrangements with the adviser.

## Operations and go-live

- [ ] Platform demonstrates a database and private-object restore in an isolated UK environment. Record observed recovery time and data gap against the approved RTO and RPO. Verify access, files, erasures, revocations and ledger after restore. [Backup and restore](backup-restore.md)
- [ ] On-call verifies external liveness, synthetic authenticated checks, cron heartbeats, error alerts, backup freshness and alert acknowledgement. Demonstrate delivery, unsubscribe and preferences with synthetic recipients, and exercise missing-job and failure alerts. [Monitoring](monitoring.md)
- [ ] Security and privacy run a tabletop for disclosure or a leaked credential. Verify contact routes, containment and customer/controller notification responsibilities. [Incident response](incident-response.md)
- [ ] After promotion, the release owner checks production liveness, Auth, private Storage, Stripe endpoint health and the first scheduled jobs. Record the go/no-go decision, evidence links, operator and timestamp. Keep the launch open until monitoring confirms normal operation.
