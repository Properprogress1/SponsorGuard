# Audit packs

Owners and admins with verified MFA can open **Audit pack** for their organisation, save an ordered checklist and queue a ZIP. Enter one item per line or clear the checklist to omit it. A queued job keeps the checklist saved when the job was requested. The page shows recent jobs and updates while a pack is pending.

The ZIP contains:

- **index.pdf** with the checklist, sponsored and engaged worker register, right-to-work checks and follow-up dates, reporting event and due dates, self-reported key personnel, document list and ledger verification summary. The index includes the generation timestamp in London time and UTC and the SponsorGuard disclaimer.
- **records.json** with the same underlying records in UTF-8, including text that the PDF font cannot render and a path for each archived document.
- **documents/** with original ready vault files. Files use record IDs as filenames.

The database takes a consistent snapshot when generation starts. The ledger summary describes verification at that point. Document bytes are fetched afterwards from the corresponding tenant’s vault. If any listed file is missing or its size has changed, generation fails. The status page and index describe records on file. SponsorGuard tracks your records. It does not provide immigration advice or guarantee compliance.

## Operations

Run the database migration and configure the existing Supabase service-role key and `CRON_SECRET`. The checked-in Vercel schedule invokes the worker daily in the 09:00 UTC hour. For commercial deployments, configure the five-minute schedule in the deployment guide. [Deployment](deployment.md) On other hosts, schedule `GET /api/cron/audit-packs` with the `Authorization: Bearer <CRON_SECRET>` header. Each invocation claims one job. The request that queues the pack only writes a job record. Expired worker leases can be reclaimed. Repeated or stale attempts cannot publish the same job.

The worker supports up to 10,000 index records, 40 MiB of source documents and a 45 MiB archive. Configure the deployment's Storage upload limit to allow 45 MiB. Oversized requests show a failed job with the size-limit message.

Archived packs are private. Each download verifies the current manager role and creates a signed URL valid for 60 seconds. Keep downloaded copies within your organisation’s data-handling process. Pack files remain in Storage until removed by an operator. Clear archive objects through the Storage API before rolling back the migration. If an upload completed but the worker could not confirm whether it published the job, check the job and its attempt before removing an unreferenced object.
