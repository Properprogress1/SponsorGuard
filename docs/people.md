# People records

Open **People** in an organisation to switch between sponsored workers, engaged
individuals, Certificates of Sponsorship (CoS) and right to work checks. Each list
shows its count of records on file, with filters for status, engagement type,
check method or follow-up. An RTW follow-up is due on or after the date recorded
in the organisation’s record, using the Europe/London calendar. The application
displays dates in DD/MM/YYYY.

Owners, admins and HR users can add, edit and import records. Viewers can read
records in their own organisation. All access requires MFA. A CoS record links
to a sponsored worker. An RTW check links to either a sponsored worker or an
engaged individual. Database foreign keys enforce that links stay within the
same organisation.

## CSV import

Open the intended record type, select **Import CSV**, choose a UTF-8 CSV and
select **Read columns**. Map source headers to the listed fields. The first
CSV record must contain distinct column names. Import accepts up to 500 data
records and 512 KiB per file.

| Record type        | Required values                                       | Allowed categories or statuses                                  |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------------------- |
| Sponsored worker   | Full name, reference, status                          | `active`, `inactive`                                            |
| Engaged individual | Full name, reference, engagement type                 | `employee`, `contractor`, `subcontractor`, `agency`, `platform` |
| CoS record         | Reference, sponsored worker ID, assigned date, status | `assigned`, `used`, `withdrawn`                                 |
| RTW check          | One person ID, check date, method                     | `online`, `manual`, `other`                                     |

Copy linked person IDs from the relevant detail pages. Dates accept DD/MM/YYYY
or YYYY-MM-DD. Follow-up is optional and must be on or after the check date.
References are unique within the organisation and record type. RTW checks can
record multiple checks for a person. Text columns support quoted commas.

For example, a synthetic sponsored worker import can contain the following.

```csv
Name,Reference,State
Synthetic Worker,DEMO-WORKER-23,active
```

The importer validates the full file before submitting a single bulk insert. An
invalid row, duplicate reference or invalid link rejects the complete batch.
Validation errors identify CSV record numbers, with the header counted as record

1. If the connection fails after submission, check the list before retrying.

## Synthetic data

Seeding is opt-in and intended for a disposable local organisation. Create an
organisation through onboarding, then copy its UUID from the workspace URL.
The seed requires a worker slot. For a disposable database, a local database
administrator can mark that fixture organisation as Pro before running the
script.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v organisation_id='<local-organisation-uuid>' \
  -f supabase/seeds/enable_synthetic_plan.sql -f supabase/seeds/synthetic_people.sql
```

The script adds synthetic records for all four record types and can be run again
without duplicating them. Sample dates are illustrative. Follow-up dates are
entered by users. They are not generated from a legal reporting window.

The rollback script `supabase/rollback/20261122010000_people_records.sql` drops
the four record tables and their data. Run it before reverting the tenant schema,
and mark version `20261122010000` reverted in Supabase migration history.
