# Scheduled email digests

In **Notifications**, users can opt in to one email per London calendar day across their workspaces and choose which topics to include. Accounts start opted out. Recipients need a confirmed email and current membership. Empty digests are skipped.

- **Tasks** includes open reporting tasks due today or earlier. Owners and admins also receive counts of open personnel handover tasks.
- **Documents** includes ready documents reaching the existing 90-, 30- or 7-day expiry milestones that day.
- **Right-to-work** includes follow-ups due today or earlier from each person's latest check on or before the digest date.
- **Key personnel** includes unfilled roles and self-reported login dates at or beyond the configured inactivity threshold. This topic is available only to owners and admins for their own workspaces.

Emails contain topic counts and sign-in and unsubscribe links. The signed unsubscribe link offers confirmation in a browser and accepts a one-click POST from an email client. Repeated POSTs have the same effect. Users can opt in again from Notifications.

## Deployment

Set `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NOTIFICATION_APP_ORIGIN`, `NOTIFICATION_UNSUBSCRIBE_SECRET` and the existing Supabase server credentials. Use distinct high-entropy secrets, an HTTPS app origin and a sender on a verified Resend domain. Rotating the unsubscribe secret invalidates links signed with the previous value.

The production Vercel schedule invokes `GET /api/cron/notifications` at 08:00 UTC. Other hosts can schedule the same endpoint with an `Authorization: Bearer <CRON_SECRET>` header. On any host the database claim uses the Europe/London calendar day. If needed, invoke the endpoint again that day to process recipients who were outside the 2,000-claim per-run limit.

The database claims recipients before dispatch and enforces uniqueness per account and London date. Each Resend batch also uses an idempotency key. A failed request, ambiguous provider acknowledgement or crash after claiming can leave the batch undelivered. Claims are kept and are excluded from same-day replay to prevent duplicate delivery. An HTTP 502 needs investigation. Check delivery state in `public.notification_digest_deliveries` using aggregate counts and the Resend dashboard. An accepted state records provider acceptance. The next day's run evaluates current records and preferences again. In-progress sends may finish after a recipient opts out.

The fake-clock tests exercise local day boundaries, overlapping invocations, acknowledgement loss and the HTTP handlers with a fake provider. pgTAP exercises real database claims, preferences, role and tenant visibility and unsubscribe. Tests use synthetic recipients.
