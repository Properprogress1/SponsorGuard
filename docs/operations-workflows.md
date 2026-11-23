# Weekly actions, evidence and change review

- **Weekly actions** shows outstanding reporting tasks, ready document expiries and the latest right-to-work follow-up per person, including items overdue or due within seven days. Owners and admins can assign actions to a direct client team member and set or clear escalation. Escalation is displayed in the queue and does not send a separate message. The underlying record owns completion.
- **Adviser work queue** shows actions in workspaces linked by explicit client consent. The existing delegated role governs access and revocation cuts it off. Editors can comment or hand an action back. Use comments for process notes and keep personal details and secrets out. An acknowledgement clears the hand-back flag.
- **Change review** compares a UTF-8 CSV with existing workers by reference. Use the headings `Reference, Role, Weekly hours, Work location`. A preview does not change records. Confirm each intended change individually. A stale preview does not overwrite changes since the preview and must be regenerated. Blank existing values can be set as the initial details. Reviewers decide any subsequent action.
- **Evidence requests** lets native Pro managers issue and revoke a seven-day link scoped to one worker and document type. Share the link with its intended recipient through an approved channel. The app does not send the link. The URL fragment keeps the token out of request paths and the database stores its hash. The recipient can submit one PDF, JPEG or PNG up to 4 MiB. Clean submissions stay private pending review. Approval files the document and records the usual document event. Rejected or interrupted uploads are removed by the privacy job. Existing erasure covers linked files and requests. Content that must be retained for review stays in the vault until the manager decides or the person is erased.

## Finding and assigning actions

For paid workspaces, the dashboard links directly to Overdue, Due in the next seven days and Handed back. The counts cover the visible tenant queue. An item with a hand-back can also be overdue or upcoming. The weekly action list adds My actions and Unassigned, and shows 25 rows per page. Filters apply to the entire eligible queue before pagination. Managers can assign or escalate a row directly. Discussions keep the current filter and page in the URL.

## Enable external submissions

Set `EVIDENCE_SCANNER_URL` to an approved HTTPS scanner and store `EVIDENCE_SCANNER_TOKEN` in the server secret store. The app sends a POST with bearer authentication, the validated MIME type and file bytes. Return HTTP 200 with JSON `{"verdict":"clean"}` or `{"verdict":"infected"}`. Only an explicit clean result permits Storage upload. The internal document upload stub is separate. Choose a provider with suitable data handling, region and retention terms before using real records.

Exercise both verdicts, scanner failure, expiring and revoked links, and permitted and denied review downloads in staging. Confirm that the scheduled privacy job removes rejected and interrupted files. Workflows can use synthetic data while the scanner and pilots are being set up.
