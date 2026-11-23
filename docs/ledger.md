# Compliance Passport ledger

The ledger is **tamper-evident**. The guarantee covers changes detectable against
the chain currently stored or an independently retained checkpoint. A database
operator with sufficient privileges can disable the guards, remove the end of a
chain, or reconstruct a replacement history. Internal verification alone
cannot establish tamper-proof custody or prove when the first record existed.

## Entries and access

Each organisation has a sequence that starts at 1. Changes to right-to-work
checks, reporting events, ready documents and key personnel append entries in the
same transaction as the record change. A staged document appends when it becomes
ready. A no-op update adds no entry. Coverage begins at migration time.

The append function is `SECURITY DEFINER` with a fixed search path. Application
writes reach it through database triggers. An organisation-scoped transaction lock serialises
appends. The ledger rejects updates, deletions and truncation, and its foreign
key preserves the organisation reference while entries exist. Members with
verified MFA can read and run `verify_chain` for their own organisation.

Stored metadata contains the operation, organisation UUID, record type and
sequence. The separate record reference is also a UUID. These pseudonymous
references remain linkable by authorised users. The ledger never copies source
fields such as names, passport numbers, addresses, document contents or notes.

## Hash format

The first previous hash is 32 zero bytes. The input to SHA-256 is the
concatenation of the raw previous-hash bytes and UTF-8 encodings of these fields
in order.

1. Canonical metadata JSON with keys `operation`, `organisation_id`,
   `record_type` and `sequence` in that order. The JSON has no whitespace,
   UUIDs are lowercase and the sequence is a JSON integer.
2. The creation timestamp in UTC with six fractional digits and a trailing `Z`.
3. The lowercase, hyphenated record UUID.

The Passport screen re-verifies available entries when opened. The verifier
checks sequence continuity, previous-hash links and recomputed entry hashes. It
reports the first mismatching sequence when it detects a change.

## Optional external timestamps

A later integration could periodically submit a chain-head hash as the message
imprint to an independent RFC 3161 Time-Stamping Authority. Retain the signed
token, organisation and sequence checkpoint outside the database. Verify the
authority’s signature, trust chain, imprint and nonce where used, then compare
the recorded checkpoint with the local chain. This provides evidence that the
anchored head existed by the certified time. Source records and personal data
stay out of the timestamp request. [RFC 3161](https://www.rfc-editor.org/rfc/rfc3161)

## Tests and rollback

The pgTAP suite exercises source events, tenant access, payload shape and
detection of privileged tampering. The rollback at
`supabase/rollback/20261122040000_ledger.sql` removes the ledger and its capture
triggers. Use it only where the ledger history can be discarded, and mark that
migration version reverted in Supabase migration history. The separate key
personnel migration has its own rollback.

See [Passport sharing](passport-sharing.md) for link scopes, passcodes and revocation.
