# Reporting deadlines and tasks

Open **Reporting** in your workspace, enter the date the event occurred and pick
the applicable rule. Owners, admins and HR users can record events and complete
or reopen the resulting tasks. Viewers can see their organisation’s events and
tasks. Both screens require verified MFA.

## Working days

The database counts from the day after the event. It skips Saturday, Sunday
and England and Wales bank holidays, including substitute dates. It selects the
rule version using the event date and saves that exact version and computed due
date with the event. An event and its task are created in one transaction.

The holiday snapshot covers 2025–2028. A calculation stops if the event year or
any year crossed before the deadline lacks coverage. Extend the calendar with a
migration that adds the year and its complete holiday list together. Use the
official England and Wales feed and review its updates for exceptional holidays.
[GOV.UK bank holidays API](https://www.gov.uk/bank-holidays.json)

## Rule changes

- Keep the same rule key and insert a new version. The database rejects updates,
  deletes and truncation of rule history.
- The latest effective start on or before the event date wins. If two versions
  have that same start, the highest version wins. `effective_to` is exclusive.
  An older version stays superseded when its replacement expires.
- The starter rules carry **VERIFY against current Home Office guidance**.
  Their effective starts are illustrative. Review the source and exceptions
  before inserting a verified version. Existing deadlines retain their saved
  date and version after a change.
  [Home Office sponsor duties and compliance guidance](https://www.gov.uk/government/publications/workers-and-temporary-workers-guidance-for-sponsors-part-3-sponsor-duties-and-compliance/workers-and-temporary-workers-guidance-for-sponsors-part-3-sponsor-duties-and-compliance-accessible#reporting-duties)

## Task states and tests

Open tasks are overdue once their saved due date is before today in
Europe/London. The Due soon filter includes today and the next three calendar
days. This display window is separate from the working-day calculation.

`npm run db:test` runs pgTAP cases for weekends, bank holidays, year boundaries,
rule changes, tenant access and task creation. `npm run check` tests task-state
boundaries and version selection in the form. To revert the reporting schema on a
disposable database, run `supabase/rollback/20261122020000_reporting.sql` and mark
that version reverted in Supabase migration history. The rollback drops the
reporting records and their tasks.
