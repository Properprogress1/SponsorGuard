# Document vault

Owners, admins and HR users can upload documents for a sponsored worker or
engaged individual in their organisation. Any member with verified MFA can read
or download their organisation’s ready documents. Issue and expiry dates are
optional and use DD/MM/YYYY. When both dates are entered, expiry must fall on or
after issue.

Set the server-only `SUPABASE_SERVICE_ROLE_KEY` for uploads. The server checks
membership, the person link, a limit of 5 MiB, the declared MIME type and the
file signature. The private `sponsorguard-documents` bucket allows PDF, JPEG and
PNG and enforces the same size limit. An object uses the organisation and
document UUIDs as its path. The original upload filename is discarded.

After validation, the server stages a pending row, uploads the object, and marks
the row ready. Pending or unregistered objects stay inaccessible to members. If
finalisation is interrupted, check the row’s state before retrying. Operators
can remove abandoned pending objects through the Storage API and then remove
their pending metadata. Removing an organisation through a trusted process also
requires removing its stored objects through the Storage API.

The app signs downloads with the member’s session. Both the route and the Storage
policy enforce tenant scope, and the app’s URLs expire after 60 seconds. A signed
URL is a bearer link until it expires. [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)

## Malware check hook

`src/lib/documents/scanner.ts` exports the `DocumentScanner` interface. A provider
receives the validated bytes and MIME type before the app stores the document.
Return `clean` to accept, `infected` to reject, or `unavailable` when checking
fails. A thrown error also rejects the upload. Keep file data out of provider
logs and use a bounded timeout for external requests.

The repository stub returns `not_scanned`, which the vault records as
**Scan not run**. Replace the stub with a real scanner before using the vault for
live documents. The signature check identifies file format and the scanner
supplies the separate malware verdict.

## Expiry reminders and verification

`queue_document_expiry_notifications()` inserts one notification row per document
at 90, 30 and 7 calendar days before expiry, using today in Europe/London. It
catches up missed thresholds for ready documents that have yet to expire. An
undated or pending document has no notifications. The Documents screen displays
the latest notification rows.

When `pg_cron` is available and preloaded, the migration schedules
`sponsorguard-document-reminders` daily at 08:00 UTC on a default UTC scheduler.
If Cron was enabled later, register the job using the same SQL as the migration.
Trusted operators can also invoke the queue function manually. [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart)

`npx supabase test db supabase/tests/database/documents.test.sql` checks object
and metadata policies, reminder timing and idempotency. Full-stack CI also
checks upload, download and denial of signing for another organisation through
the Storage API. To run those checks on a local Supabase stack, set
`SPONSORGUARD_STORAGE_E2E=1` when running `npm run test:e2e:auth`.

To roll back on a disposable environment, empty the bucket through the Storage
API before applying `supabase/rollback/20261122030000_documents.sql`. Mark
version `20261122030000` reverted in Supabase migration history.
