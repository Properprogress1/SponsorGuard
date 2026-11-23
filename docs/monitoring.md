# Production monitoring

Assign a primary and backup responder. Configure alerts in the monitoring provider and exercise delivery and acknowledgement before launch. The thresholds below are starting operational settings. Tune them after staging and document the agreed values in the on-call handover.

## External liveness

Run the probe every minute from a UK monitor. It requires HTTP 200, JSON `status: ok` and `Cache-Control: no-store` within five seconds. It exits non-zero on failure and prints only a fixed event and outcome. An HTTP monitor can use the same criteria against `GET /api/health`.

```sh
MONITOR_ORIGIN=https://app.example.com npm run monitor:health
```

Page after three consecutive failures and verify recovery from a second network. This endpoint checks the web process only. Check Supabase health separately and run a restricted MFA-backed synthetic sign-in, tenant read and private test file download daily. Use dedicated synthetic accounts and files. Keep credentials outside the script and logs.

## Signals and response

| Signal                                   | Starting trigger                                                                                             | Where to look                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Web availability and database saturation | Liveness page, sustained elevated 5xx or latency, database connections or disk approaching capacity          | External monitor, Vercel Observability and Supabase metrics.                                                                     |
| Authentication and sharing               | Sustained `rate_limit` events with `outcome=unavailable`, or denial volume above baseline                    | Check database connectivity and runtime secrets. Check the proxy and provider auth controls if legitimate access is throttled.   |
| Audit packs                              | No healthy invocation in 15 minutes or oldest queued job exceeds 30 minutes                                  | Vercel audit-packs logs and aggregate job counts. A healthy idle run can count as a heartbeat. Check failed outcomes separately. |
| Privacy storage cleanup                  | No successful invocation in two hours, growing retry count or overdue deletions                              | Vercel privacy logs and aggregate pending records in `privacy_storage_cleanup`.                                                  |
| Email digest                             | No successful invocation by 09:00 UTC, uncertain delivery or an abnormal provider rejection rate             | Vercel notifications logs and Resend delivery metrics. Reconcile uncertain sends before retrying.                                |
| Document reminders                       | No successful daily run by 09:00 UTC                                                                         | Inspect `cron.job_run_details` for `sponsorguard-document-reminders` via an operator account.                                    |
| Billing                                  | Sustained webhook 5xx, missing events or subscriptions and app plans diverge                                 | Stripe endpoint health and `stripe_webhook` retry events. Check rejected signatures separately.                                  |
| Recovery and integrity                   | Database or object backup exceeds the approved RPO, copy/hash mismatches, or any ledger verification failure | Backup inventory and protected operator checks. Escalate unexpected ledger failures immediately.                                 |

Cron delivery is best effort. Alert on absent successes as well as visible errors. Use app logs with fixed categories and aggregate counts. Configure provider log filters and redaction so alerts and log drains omit client addresses, identities, document paths, query strings, headers and bodies. Send notifications to restricted on-call channels and retain logs for the approved period. [Vercel Cron behaviour](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs), [Vercel alerts](https://vercel.com/docs/alerts), [Security review](security-review.md)

During staging, trigger a controlled liveness failure and a missing-heartbeat alert. Verify the recipient, escalation and recovery notification. Record who received the page and how long acknowledgement took. [Incident response](incident-response.md)
