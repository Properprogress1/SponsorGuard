# Key Personnel

Owners and admins can record the Authorising Officer, Key Contact and Level 1 users in **Key Personnel**. Names, roles, SMS MFA status, last SMS login dates and departure flags are self-reported. The app has no connection to the Home Office Sponsor Management System (SMS). Leave the last login date blank if it is unknown.

A role is unfilled when nobody who is staying holds it. An inactive person has a reported last login at least the configured number of calendar days ago in Europe/London. Missing login dates produce a separate alert. Alerts appear in Key Personnel.

The inactivity reminder is an internal setting. The migration seeds 90 calendar days with a verification marker. To change the threshold, an operator inserts a row in `public.personnel_inactivity_rules` with the new `effective_from`, `inactivity_days` and `source_reference`. The latest version effective on the current London date applies.

Marking someone as leaving creates three checklist tasks in **Tasks**. Owners and admins can complete or reopen the tasks. Each personnel record has one checklist, with progress preserved if the departure flag is changed. A legacy free-text role remains visible until the record is edited, at which point a supported role must be selected.
