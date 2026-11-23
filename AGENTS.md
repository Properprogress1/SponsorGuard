Read this file before starting any task in this repository.

PRODUCT: SponsorGuard UK (working name, trademark unchecked). Multi-tenant SaaS for UK employers with a sponsor licence and 5-50 sponsored workers, no in-house immigration team.
POSITIONING: "The audit-proof record for UK sponsors": time-stamped, tamper-evident evidence that holds up to Home Office visits and to clients, lawyers and lenders.
HERO FEATURE: Compliance Passport, an append-only hash-chained ledger of record events, shareable as a read-only, expiring, revocable view.
SUPPORTING: Continuity Guard (key personnel and SMS access resilience), Extended Workforce RTW Map (employees, contractors, subcontractors, agency and platform workers), configurable reporting clocks, document vault with expiry reminders, audit pack export.
NON-GOALS: no legal or immigration advice; no scraping of or integration with the Home Office SMS; no compliance score or readiness percentage anywhere (use counts, e.g. "38 of 42 required records on file"). Status pages carry the disclaimer: "SponsorGuard tracks your records. It does not provide immigration advice or guarantee compliance."
STACK: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui; Supabase (Postgres, Auth with MFA, private Storage, Edge Functions or route handlers, pg_cron); Stripe; Resend; Vitest, Playwright, pgTAP. Deploy region London/UK where available.
RULES: UK English, DD/MM/YYYY, Europe/London, GBP. WCAG AA. RLS on every table with no exceptions. All legal values (reporting windows, thresholds, retention) live in versioned config tables with a source reference and effective dates, never hard-coded; seed values are marked "VERIFY against current Home Office guidance". No personal data in logs, analytics or ledger payloads. Strict TypeScript, no any. Every task: write tests first or alongside, run lint + typecheck + tests, update /docs, open a small PR.
DEFINITION OF DONE: CI green, migrations reversible, RLS tests prove tenant isolation, no secrets committed, docs updated.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
