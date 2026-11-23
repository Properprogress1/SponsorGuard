# Sharing the Compliance Passport

Owners and admins can create or revoke links in **Passport** after completing MFA. Copy the URL when it appears and send any passcode separately. Opening a link requires a browser with JavaScript enabled.

## Scope and expiry

- **All entries** includes the organisation's ledger events.
- **Selected people** includes right-to-work and ready-document ledger events associated with the chosen people when the event was recorded. This association is captured from the sharing migration onwards. Earlier events and events without a recorded person association are excluded from this scope.
- **Date range** includes entries recorded from the start of the first day through the end of the last day in Europe/London.

Links show matching entries as they are added to the ledger. The public page shows the record type, action and recorded time. The expiry date is inclusive in Europe/London. Revocation and expiry apply to subsequent reads, including page navigation. Recipients can keep copies of entries they have already seen.

## Link security and access activity

Each link uses a 32-byte cryptographically random token. The database stores its SHA-256 digest and an optional scrypt passcode digest salted with that link's token digest. The one-time URL carries the token in its fragment. The public page submits it to the server over the same origin. Production deployments should use HTTPS.

After five incorrect guesses, a link is locked for 15 minutes. The limit applies to the link across browsers. Failed guesses are tracked from the most recent failure, and the database serialises checks so concurrent requests cannot bypass the limit. Opening a link successfully does not clear previous failures.

The access log records the share and organisation references, event time and outcome. The Passport screen shows recent successful reads, incorrect passcodes and lockouts. The log omits viewer names, IP addresses, user agents, tokens and passcodes. Keep request-body capture disabled for the public Passport action in infrastructure and application telemetry. The server uses the existing Supabase service-role configuration to verify shares. Keep that key server-side.
